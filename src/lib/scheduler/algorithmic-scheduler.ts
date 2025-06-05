
'use server';

import type { Service, Employee, FixedAssignment } from '@/lib/types';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule'; 
import { format, getDaysInMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { SHIFT_OPTIONS } from '@/lib/constants/schedule-constants'; 

interface AlgorithmicScheduleOutput {
  generatedShifts: AIShift[];
  responseText: string;
}

// Lista de feriados (formato MM-DD para que se repitan anualmente)
// Ejemplo para Argentina (se puede expandir o cambiar)
const HOLIDAYS: string[] = [
  '01-01', // Año Nuevo
  // '02-20', // Carnaval (variable, ejemplo)
  // '02-21', // Carnaval (variable, ejemplo)
  '03-24', // Día Nacional de la Memoria por la Verdad y la Justicia
  '04-02', // Día del Veterano y de los Caídos en la Guerra de Malvinas
  // '04-07', // Viernes Santo (variable, ejemplo)
  '05-01', // Día del Trabajador
  '05-25', // Día de la Revolución de Mayo
  '06-17', // Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes
  '06-20', // Paso a la Inmortalidad del Gral. Manuel Belgrano
  '07-09', // Día de la Independencia
  // '08-17', // Paso a la Inmortalidad del Gral. José de San Martín (trasladable, ej. 21/08)
  // '10-12', // Día del Respeto a la Diversidad Cultural (trasladable, ej. 16/10)
  // '11-20', // Día de la Soberanía Nacional (trasladable, ej. 20/11)
  '12-08', // Inmaculada Concepción de María
  '12-25', // Navidad
];


// Helper to check if a date falls within a range
const isDateInRange = (date: Date, startDate: Date, endDate?: Date): boolean => {
  if (endDate) {
    return isWithinInterval(date, { start: startOfDay(startDate), end: endOfDay(endDate) });
  }
  return format(startOfDay(date), 'yyyy-MM-dd') === format(startOfDay(startDate), 'yyyy-MM-dd');
};

const isEmployeeOnFixedAssignmentOnDate = (
  employee: Employee,
  targetDate: Date,
): FixedAssignment | null => {
  if (!employee.fixedAssignments || employee.fixedAssignments.length === 0) {
    return null;
  }
  for (const assignment of employee.fixedAssignments) {
    if (!assignment.startDate) continue;
    const assignmentStartDate = parseISO(assignment.startDate);
    const assignmentEndDate = assignment.endDate ? parseISO(assignment.endDate) : assignmentStartDate;

    if (isDateInRange(targetDate, assignmentStartDate, assignmentEndDate)) {
      return assignment;
    }
  }
  return null;
};


const getShiftDetails = (shiftCode: 'M' | 'T' | 'N'): { startTime: string; endTime: string; notesSuffix: string } => {
    const option = SHIFT_OPTIONS.find(opt => opt.value === shiftCode);
    return {
        startTime: option?.startTime || '',
        endTime: option?.endTime || '',
        notesSuffix: `(${shiftCode})`
    };
}

export async function generateAlgorithmicSchedule(
  service: Service,
  month: string, // "1"-"12"
  year: string,  // "2024"
  allEmployees: Employee[]
): Promise<AlgorithmicScheduleOutput> {
  const generatedShifts: AIShift[] = [];
  const monthInt = parseInt(month, 10);
  const yearInt = parseInt(year, 10);
  const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));

  const employeesForService = allEmployees.filter(emp => emp.serviceIds.includes(service.id));
  if (employeesForService.length === 0) {
    return { generatedShifts: [], responseText: `No hay empleados asignados al servicio ${service.name} para generar el horario.` };
  }

  const employeeShiftCounts: Record<string, number> = {};
  employeesForService.forEach(emp => employeeShiftCounts[emp.id] = 0);

  for (let day = 1; day <= daysInMonthCount; day++) {
    const currentDate = new Date(yearInt, monthInt - 1, day);
    const currentDateStr = format(currentDate, 'yyyy-MM-dd');
    const currentMonthDayStr = format(currentDate, 'MM-dd'); // For holiday check
    const dayOfWeek = getDay(currentDate); 
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = HOLIDAYS.includes(currentMonthDayStr);
    const useWeekendHolidayStaffing = isWeekend || isHoliday;

    const staffingNeeds = {
      morning: useWeekendHolidayStaffing ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
      afternoon: useWeekendHolidayStaffing ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
      night: (service.enableNightShift && useWeekendHolidayStaffing) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
    };

    const dailyAssignedWorkShifts = new Set<string>(); // Track employees assigned M, T, N shift on this day
    const dailyProcessedAssignments = new Set<string>(); // Track employees who got LAO, LM, or will get D

    // 1. Process Fixed Assignments (LAO, LM)
    employeesForService.forEach(emp => {
      const fixedAssignment = isEmployeeOnFixedAssignmentOnDate(emp, currentDate);
      if (fixedAssignment && (fixedAssignment.type === 'LAO' || fixedAssignment.type === 'LM')) {
        generatedShifts.push({
            date: currentDateStr,
            employeeName: emp.name,
            serviceName: service.name,
            startTime: '', 
            endTime: '',
            notes: fixedAssignment.type + (fixedAssignment.description ? ` - ${fixedAssignment.description}` : ''),
        });
        dailyProcessedAssignments.add(emp.id); 
      }
    });
    
    // 2. Assign Work Shifts (M, T, N)
    const assignShiftsForType = (
        shiftType: 'M' | 'T' | 'N',
        needed: number
      ) => {
        if (needed <= 0) return;

        let assignedCount = 0;
        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftType);
        
        // Filter employees not already processed for LAO/LM and sort by current shift count
        const availableForWork = employeesForService
            .filter(emp => !dailyProcessedAssignments.has(emp.id))
            .sort((a, b) => employeeShiftCounts[a.id] - employeeShiftCounts[b.id]);

        for (const emp of availableForWork) {
          if (assignedCount >= needed) break;
          if (!dailyAssignedWorkShifts.has(emp.id)) { 
            generatedShifts.push({
              date: currentDateStr,
              employeeName: emp.name,
              serviceName: service.name,
              startTime: startTime,
              endTime: endTime,
              notes: `${format(currentDate, 'EEEE', { locale: es })} ${notesSuffix}`,
            });
            dailyAssignedWorkShifts.add(emp.id);
            dailyProcessedAssignments.add(emp.id); // Mark as processed for the day
            employeeShiftCounts[emp.id]++;
            assignedCount++;
          }
        }
      };
    
    assignShiftsForType('M', staffingNeeds.morning);
    assignShiftsForType('T', staffingNeeds.afternoon);
    if (service.enableNightShift) {
      assignShiftsForType('N', staffingNeeds.night);
    }

    // 3. Assign 'D' (Descanso) for remaining service employees not assigned anything
    employeesForService.forEach(emp => {
        if (!dailyProcessedAssignments.has(emp.id)) {
            generatedShifts.push({
                date: currentDateStr,
                employeeName: emp.name,
                serviceName: service.name,
                startTime: '',
                endTime: '',
                notes: 'D (Descanso)', 
            });
            dailyProcessedAssignments.add(emp.id); // Technically already processed as they get D
        }
    });
  }

  return {
    generatedShifts,
    responseText: `Horario generado algorítmicamente para ${service.name} para ${format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es })}. Se crearon ${generatedShifts.length} turnos.`,
  };
}
