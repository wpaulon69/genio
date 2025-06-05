
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
  allEmployees: Employee[],
  holidays: Array<{ date: string; name: string }> // YYYY-MM-DD
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
    const currentDateStrYYYYMMDD = format(currentDate, 'yyyy-MM-dd');
    
    const dayOfWeek = getDay(currentDate); 
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 for Sunday, 6 for Saturday
    
    const holidayOnDate = holidays.find(h => h.date === currentDateStrYYYYMMDD);
    const isHoliday = !!holidayOnDate;
    const useWeekendHolidayStaffing = isWeekend || isHoliday;

    const staffingNeeds = {
      morning: useWeekendHolidayStaffing ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
      afternoon: useWeekendHolidayStaffing ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
      night: (service.enableNightShift && useWeekendHolidayStaffing) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
    };

    const dailyAssignedWorkShifts = new Set<string>(); 
    const dailyProcessedAssignments = new Set<string>(); 

    employeesForService.forEach(emp => {
      const fixedAssignment = isEmployeeOnFixedAssignmentOnDate(emp, currentDate);
      if (fixedAssignment && (fixedAssignment.type === 'LAO' || fixedAssignment.type === 'LM')) {
        generatedShifts.push({
            date: currentDateStrYYYYMMDD,
            employeeName: emp.name,
            serviceName: service.name,
            startTime: '', 
            endTime: '',
            notes: fixedAssignment.type + (fixedAssignment.description ? ` - ${fixedAssignment.description}` : ''),
        });
        dailyProcessedAssignments.add(emp.id); 
      }
    });
    
    const assignShiftsForType = (
        shiftType: 'M' | 'T' | 'N',
        needed: number
      ) => {
        if (needed <= 0) return;

        let assignedCount = 0;
        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftType);
        
        const availableForWork = employeesForService
            .filter(emp => !dailyProcessedAssignments.has(emp.id))
            .sort((a, b) => employeeShiftCounts[a.id] - employeeShiftCounts[b.id]);

        for (const emp of availableForWork) {
          if (assignedCount >= needed) break;
          if (!dailyAssignedWorkShifts.has(emp.id)) { 
            generatedShifts.push({
              date: currentDateStrYYYYMMDD,
              employeeName: emp.name,
              serviceName: service.name,
              startTime: startTime,
              endTime: endTime,
              notes: `${format(currentDate, 'EEEE', { locale: es })} ${notesSuffix}`,
            });
            dailyAssignedWorkShifts.add(emp.id);
            dailyProcessedAssignments.add(emp.id); 
            employeeShiftCounts[emp.id]++;
            assignedCount++;
          }
        }
      };
    
    assignShiftsForType('M', staffingNeeds.morning);
    assignShiftsForType('T', staffingNeeds.afternoon);
    if (service.enableNightShift && staffingNeeds.night > 0) {
      assignShiftsForType('N', staffingNeeds.night);
    }

    employeesForService.forEach(emp => {
        if (!dailyProcessedAssignments.has(emp.id)) {
            generatedShifts.push({
                date: currentDateStrYYYYMMDD,
                employeeName: emp.name,
                serviceName: service.name,
                startTime: '',
                endTime: '',
                notes: 'D (Descanso)', 
            });
            dailyProcessedAssignments.add(emp.id); 
        }
    });
  }

  const monthName = format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es });
  return {
    generatedShifts,
    responseText: `Horario generado algorítmicamente para ${service.name} para ${monthName}. Se crearon ${generatedShifts.length} turnos.`,
  };
}
