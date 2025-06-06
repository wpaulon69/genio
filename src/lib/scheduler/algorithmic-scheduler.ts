
'use server';

import type { Service, Employee, FixedAssignment, Holiday } from '@/lib/types';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule';
import { format, getDaysInMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getDay, subDays, lastDayOfMonth, isValid } from 'date-fns';
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
  lastShiftType?: AIShift['notes'] | 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C';
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
  previousMonthShifts: AIShift[] | null
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

  // Initialize employeeStates based on previousMonthShifts (last 5 days)
  if (previousMonthShifts && previousMonthShifts.length > 0) {
    const firstDayOfCurrentMonth = new Date(yearInt, monthInt - 1, 1);
    const sortedPreviousShifts = [...previousMonthShifts].sort((a, b) => {
        const dateA = parseISO(a.date);
        const dateB = parseISO(b.date);
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
        return a.employeeName.localeCompare(b.employeeName);
    });

    for (let i = 5; i >= 1; i--) { // Iterate from 5 days ago up to 1 day ago
        const dateToCheck = subDays(firstDayOfCurrentMonth, i);
        const dateToCheckStr = format(dateToCheck, 'yyyy-MM-dd');

        for (const emp of employeesForService) {
            if (!employeeStates[emp.id]) continue;

            const shiftsForEmpOnDate = sortedPreviousShifts.filter(
                s => s.date === dateToCheckStr && s.employeeName === emp.name
            );

            if (shiftsForEmpOnDate.length > 0) {
                // Assume one shift per employee per day for simplicity of this initialization
                const shift = shiftsForEmpOnDate[0];
                if (shift.startTime && shift.endTime) { // M, T, N
                    employeeStates[emp.id].consecutiveWorkDays = (employeeStates[emp.id].lastShiftType === 'M' || employeeStates[emp.id].lastShiftType === 'T' || employeeStates[emp.id].lastShiftType === 'N') ? employeeStates[emp.id].consecutiveWorkDays + 1 : 1;
                    employeeStates[emp.id].consecutiveRestDays = 0;
                    const note = shift.notes || '';
                    if (note.includes('(M)')) employeeStates[emp.id].lastShiftType = 'M';
                    else if (note.includes('(T)')) employeeStates[emp.id].lastShiftType = 'T';
                    else if (note.includes('(N)')) employeeStates[emp.id].lastShiftType = 'N';
                    else employeeStates[emp.id].lastShiftType = 'M'; // Fallback if not clear
                } else if (shift.notes?.includes('D') || shift.notes?.includes('LAO') || shift.notes?.includes('LM') || shift.notes?.includes('C')) { // D, LAO, LM, C
                    employeeStates[emp.id].consecutiveRestDays = (employeeStates[emp.id].lastShiftType === 'D' || employeeStates[emp.id].lastShiftType === 'LAO' || employeeStates[emp.id].lastShiftType === 'LM' || employeeStates[emp.id].lastShiftType === 'C') ? employeeStates[emp.id].consecutiveRestDays + 1 : 1;
                    employeeStates[emp.id].consecutiveWorkDays = 0;
                    if (shift.notes?.includes('LAO')) employeeStates[emp.id].lastShiftType = 'LAO';
                    else if (shift.notes?.includes('LM')) employeeStates[emp.id].lastShiftType = 'LM';
                    else if (shift.notes?.includes('C')) employeeStates[emp.id].lastShiftType = 'C';
                    else employeeStates[emp.id].lastShiftType = 'D';
                }
            } else { // No shift found for employee on this day from previous month
                 employeeStates[emp.id].consecutiveRestDays = (employeeStates[emp.id].lastShiftType === 'D' || employeeStates[emp.id].lastShiftType === 'LAO' || employeeStates[emp.id].lastShiftType === 'LM' || employeeStates[emp.id].lastShiftType === 'C' || employeeStates[emp.id].lastShiftType === undefined) ? employeeStates[emp.id].consecutiveRestDays + 1 : 1;
                 employeeStates[emp.id].consecutiveWorkDays = 0;
                 employeeStates[emp.id].lastShiftType = 'D'; // Assume rest if no shift
            }
        }
    }
  }


  for (let day = 1; day <= daysInMonthCount; day++) {
    const currentDate = new Date(yearInt, monthInt - 1, day);
    const currentDateStrYYYYMMDD = format(currentDate, 'yyyy-MM-dd');
    const currentDayOfWeek = getDay(currentDate); // Sunday = 0, Saturday = 6
    const isWeekend = currentDayOfWeek === 0 || currentDayOfWeek === 6;
    const isHoliday = holidays.some(h => h.date === currentDateStrYYYYMMDD);
    const useWeekendHolidayStaffing = isWeekend || isHoliday;

    const staffingNeeds = {
      morning: useWeekendHolidayStaffing ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
      afternoon: useWeekendHolidayStaffing ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
      night: (service.enableNightShift && useWeekendHolidayStaffing) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
    };

    const dailyAssignedWorkShifts = new Set<string>();
    const dailyProcessedEmployees = new Set<string>(); // Tracks employees who got any assignment (work, LAO, LM, D)

    // Step 1: Process Absences (LAO, LM)
    employeesForService.forEach(emp => {
      if (dailyProcessedEmployees.has(emp.id)) return;
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
        dailyProcessedEmployees.add(emp.id);
        employeeStates[emp.id].consecutiveRestDays = (employeeStates[emp.id].lastShiftType === 'LAO' || employeeStates[emp.id].lastShiftType === 'LM') ? employeeStates[emp.id].consecutiveRestDays + 1 : 1;
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

        // TODO: Improve candidate selection: sort by preferences, consecutiveness, load balancing
        const availableForWork = employeesForService
            .filter(emp => !dailyProcessedEmployees.has(emp.id) && !dailyAssignedWorkShifts.has(emp.id))
            // Basic check: don't assign if max consecutive work days would be violated (simplistic for now)
            .filter(emp => employeeStates[emp.id].consecutiveWorkDays < (service.consecutivenessRules?.maxConsecutiveWorkDays || 6))
            .sort((a, b) => employeeStates[a.id].shiftsThisMonth - employeeStates[b.id].shiftsThisMonth);

        for (const emp of availableForWork) {
          if (assignedCount >= needed) break;
          generatedShifts.push({
            date: currentDateStrYYYYMMDD,
            employeeName: emp.name,
            serviceName: service.name,
            startTime: startTime,
            endTime: endTime,
            notes: `${format(currentDate, 'EEEE', { locale: es })} ${notesSuffix}`,
          });
          dailyAssignedWorkShifts.add(emp.id);
          dailyProcessedEmployees.add(emp.id);
          employeeStates[emp.id].shiftsThisMonth++;
          employeeStates[emp.id].consecutiveWorkDays = (employeeStates[emp.id].lastShiftType === 'M' || employeeStates[emp.id].lastShiftType === 'T' || employeeStates[emp.id].lastShiftType === 'N') ? employeeStates[emp.id].consecutiveWorkDays + 1 : 1;
          employeeStates[emp.id].consecutiveRestDays = 0;
          employeeStates[emp.id].lastShiftType = shiftType;
          assignedCount++;
        }
      };

    assignShiftsForType('M', staffingNeeds.morning);
    assignShiftsForType('T', staffingNeeds.afternoon);
    if (service.enableNightShift && staffingNeeds.night > 0) {
      assignShiftsForType('N', staffingNeeds.night);
    }

    // Step 4: Assign Rest Days ('D')
    employeesForService.forEach(emp => {
        if (!dailyProcessedEmployees.has(emp.id)) {
            generatedShifts.push({
                date: currentDateStrYYYYMMDD,
                employeeName: emp.name,
                serviceName: service.name,
                startTime: '',
                endTime: '',
                notes: 'D (Descanso)',
            });
            dailyProcessedEmployees.add(emp.id);
            employeeStates[emp.id].consecutiveRestDays = (employeeStates[emp.id].lastShiftType === 'D' || employeeStates[emp.id].lastShiftType === 'LAO' || employeeStates[emp.id].lastShiftType === 'LM' || employeeStates[emp.id].lastShiftType === 'C') ? employeeStates[emp.id].consecutiveRestDays + 1 : 1;
            employeeStates[emp.id].consecutiveWorkDays = 0;
            employeeStates[emp.id].lastShiftType = 'D';
        }
    });

    // TODO: Step 5: Franco Post-Guardia (D/D) logic
  }

  const monthName = format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es });
  return {
    generatedShifts,
    responseText: `Horario generado algorítmicamente para ${service.name} para ${monthName}. Se crearon ${generatedShifts.length} turnos. (Lógica de consecutividad y preferencias aún en desarrollo).`,
  };
}
    