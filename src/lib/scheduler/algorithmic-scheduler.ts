
'use server';

import type { Service, Employee, FixedAssignment, Holiday } from '@/lib/types';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule'; 
import { format, getDaysInMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getDay, subDays, lastDayOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { SHIFT_OPTIONS } from '@/lib/constants/schedule-constants'; 

interface AlgorithmicScheduleOutput {
  generatedShifts: AIShift[];
  responseText: string;
}

interface EmployeeState {
  id: string;
  name: string;
  consecutiveWorkDays: number;
  consecutiveRestDays: number;
  shiftsThisMonth: number; // Count of M, T, N shifts
  lastShiftType?: AIShift['notes']; // Store the 'notes' field which indicates type for D, LAO, LM, or M/T/N
  // Potentially add more specific tracking for preferences if needed
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

    if (!isValid(assignmentStartDate) || (assignment.endDate && !isValid(assignmentEndDate))) continue;

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
  holidays: Holiday[],
  previousMonthShifts: AIShift[] | null // Shifts from the last 5 days of previous month
): Promise<AlgorithmicScheduleOutput> {
  const generatedShifts: AIShift[] = [];
  const monthInt = parseInt(month, 10);
  const yearInt = parseInt(year, 10);
  const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));

  const employeesForService = allEmployees.filter(emp => emp.serviceIds.includes(service.id));
  if (employeesForService.length === 0) {
    return { generatedShifts: [], responseText: `No hay empleados asignados al servicio ${service.name} para generar el horario.` };
  }

  // Initialize Employee States
  const employeeStates: Record<string, EmployeeState> = {};
  employeesForService.forEach(emp => {
    employeeStates[emp.id] = {
      id: emp.id,
      name: emp.name,
      consecutiveWorkDays: 0,
      consecutiveRestDays: 0,
      shiftsThisMonth: 0,
      lastShiftType: undefined,
    };
  });

  // TODO: Initialize employeeStates based on previousMonthShifts (last 5 days)
  // This involves iterating through the last few days of previousMonthShifts
  // and updating consecutiveWorkDays, consecutiveRestDays, and lastShiftType.
  if (previousMonthShifts && previousMonthShifts.length > 0) {
    const firstDayOfCurrentMonth = new Date(yearInt, monthInt - 1, 1);
    for (let i = 1; i <= 5; i++) { // Check last 5 days
        const dateToCheck = subDays(firstDayOfCurrentMonth, i);
        const dateToCheckStr = format(dateToCheck, 'yyyy-MM-dd');
        
        // Sort shifts by employee to process them in order for consecutiveness
        const shiftsOnDate = previousMonthShifts.filter(s => s.date === dateToCheckStr).sort((a,b) => a.employeeName.localeCompare(b.employeeName));

        for (const shift of shiftsOnDate) {
            const employee = employeesForService.find(e => e.name === shift.employeeName);
            if (employee && employeeStates[employee.id]) {
                // This is a simplified update. A more robust one would re-calculate from the start of the previous 5 days.
                if (shift.startTime && shift.endTime) { // Assuming M, T, N are work shifts
                    employeeStates[employee.id].consecutiveWorkDays++;
                    employeeStates[employee.id].consecutiveRestDays = 0;
                } else if (shift.notes?.includes('D') || shift.notes?.includes('LAO') || shift.notes?.includes('LM')) {
                    employeeStates[employee.id].consecutiveRestDays++;
                    employeeStates[employee.id].consecutiveWorkDays = 0;
                }
                if (i === 1) { // Most recent shift from previous month
                    employeeStates[employee.id].lastShiftType = shift.notes;
                }
            }
        }
    }
  }


  for (let day = 1; day <= daysInMonthCount; day++) {
    const currentDate = new Date(yearInt, monthInt - 1, day);
    const currentDateStrYYYYMMDD = format(currentDate, 'yyyy-MM-dd');
    
    const dayOfWeek = getDay(currentDate); 
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; 
    
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

    // Step 1: Process Absences (LAO, LM)
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
        // Update employee state for LAO/LM
        employeeStates[emp.id].consecutiveRestDays++;
        employeeStates[emp.id].consecutiveWorkDays = 0;
        employeeStates[emp.id].lastShiftType = fixedAssignment.type;
      }
    });
    
    // TODO: Step 2: Process Fixed Weekly Shifts (Preferences)

    // Step 3: Cover Staffing Needs (M, T, N)
    const assignShiftsForType = (
        shiftType: 'M' | 'T' | 'N',
        needed: number
      ) => {
        if (needed <= 0) return;

        let assignedCount = 0;
        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftType);
        
        // TODO: Improve candidate selection based on employeeStates, preferences, and consecutiveness rules
        const availableForWork = employeesForService
            .filter(emp => !dailyProcessedAssignments.has(emp.id)) // Not on LAO/LM
            // Add more filters: maxConsecutiveWorkDays, minConsecutiveRestDays
            .sort((a, b) => employeeStates[a.id].shiftsThisMonth - employeeStates[b.id].shiftsThisMonth); // Basic load balancing

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
            employeeStates[emp.id].shiftsThisMonth++;
            // Update employee state for work shift
            employeeStates[emp.id].consecutiveWorkDays++;
            employeeStates[emp.id].consecutiveRestDays = 0;
            employeeStates[emp.id].lastShiftType = shiftType; // Or use notesSuffix
            assignedCount++;
          }
        }
      };
    
    assignShiftsForType('M', staffingNeeds.morning);
    assignShiftsForType('T', staffingNeeds.afternoon);
    if (service.enableNightShift && staffingNeeds.night > 0) {
      assignShiftsForType('N', staffingNeeds.night);
    }

    // Step 4: Assign Rest Days ('D')
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
            // Update employee state for Rest day
            employeeStates[emp.id].consecutiveRestDays++;
            employeeStates[emp.id].consecutiveWorkDays = 0;
            employeeStates[emp.id].lastShiftType = 'D';
        }
    });

    // TODO: Step 5: Franco Post-Guardia (D/D) logic (if applicable)
  }

  const monthName = format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es });
  return {
    generatedShifts,
    responseText: `Horario generado algorítmicamente para ${service.name} para ${monthName}. Se crearon ${generatedShifts.length} turnos. (Lógica de consecutividad avanzada y preferencias aún en desarrollo).`,
  };
}
