
'use server';

import type { Service, Employee, FixedAssignment, Holiday, ScheduleViolation, AIShift, WorkPattern, ScoreBreakdown } from '@/lib/types';
import { format, getDaysInMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getDay, subDays, isValid, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { SHIFT_OPTIONS } from '@/lib/constants/schedule-constants';

interface AlgorithmicScheduleOutput {
  generatedShifts: AIShift[];
  responseText: string;
  violations: ScheduleViolation[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

interface EmployeeState {
  id: string;
  name: string;
  consecutiveWorkDays: number;
  consecutiveRestDays: number;
  shiftsThisMonth: number;
  lastShiftType?: AIShift['notes'] | 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F';
  lastActualWorkShiftEndTime: Date | null; // Hora y fecha de finalización del último turno M, T, o N
  completeWeekendsOffThisMonth: number; 
}

const NO_FIXED_TIMING_VALUE = "none_selected";
const REST_DAY_VALUE = "rest_day";

const isDateInRange = (date: Date, startDate: Date, endDate?: Date): boolean => {
  if (endDate) {
    return isWithinInterval(date, { start: startOfDay(startDate), end: endOfDay(endDate) });
  }
  return format(startOfDay(date), 'yyyy-MM-dd') === format(startOfDay(startDate), 'yyyy-MM-dd');
};

const isEmployeeOnFixedAssignmentOnDate = (employee: Employee, targetDate: Date): FixedAssignment | null => {
  if (!employee.fixedAssignments || employee.fixedAssignments.length === 0) return null;
  for (const assignment of employee.fixedAssignments) {
    if (!assignment.startDate) continue;
    const assignmentStartDate = parseISO(assignment.startDate);
    const assignmentEndDate = assignment.endDate ? parseISO(assignment.endDate) : assignmentStartDate;
    if (!isValid(assignmentStartDate) || (assignment.endDate && !isValid(assignmentEndDate))) continue;
    if (isDateInRange(targetDate, assignmentStartDate, assignmentEndDate)) return assignment;
  }
  return null;
};

const getShiftDetails = (shiftCode: 'M' | 'T' | 'N'): { startTime: string; endTime: string; notesSuffix: string } => {
    const option = SHIFT_OPTIONS.find(opt => opt.value === shiftCode);
    return { startTime: option?.startTime || '', endTime: option?.endTime || '', notesSuffix: `(${shiftCode})` };
}

// Helper function to create a Date object from a base date and a time string (HH:MM)
function getShiftDateTime(baseDate: Date, timeString: string, isNightShiftEndTime: boolean = false): Date {
  const [hours, minutes] = timeString.split(':').map(Number);
  const shiftDate = new Date(baseDate); // Clone baseDate to avoid modifying it
  shiftDate.setHours(hours, minutes, 0, 0);

  // If it's the end time of a night shift and the hour is before noon (e.g., 07:00),
  // it means this time falls on the next calendar day relative to the start of the night shift.
  if (isNightShiftEndTime && hours < 12) {
    shiftDate.setDate(baseDate.getDate() + 1);
  }
  return shiftDate;
}

// Checks if assigning a shift respects the 12-hour rest rule
function canAssignShiftDueToRest(
  employeeState: EmployeeState,
  shiftCodeToAssign: 'M' | 'T' | 'N',
  currentDate: Date
): boolean {
  if (!employeeState.lastActualWorkShiftEndTime) {
    return true; // No previous work shift recorded, so can assign
  }

  const { startTime: currentShiftStartTimeStr } = getShiftDetails(shiftCodeToAssign);
  // The current shift always starts on 'currentDate' (isNightShiftEndTime = false)
  const currentShiftStartTime = getShiftDateTime(currentDate, currentShiftStartTimeStr, false);
  
  const hoursDifference = (currentShiftStartTime.getTime() - employeeState.lastActualWorkShiftEndTime.getTime()) / (1000 * 60 * 60);
  
  return hoursDifference >= 12;
}


const normalizeDayName = (dayName: string): string => {
  if (!dayName) return '';
  return dayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
};

// Helper function to determine shift type for evaluation
const getShiftTypeForEval = (shift: AIShift): 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F' | null => {
    const note = shift.notes?.toUpperCase();
    if (!note) { // If no notes but has start/end time, try to infer M/T/N
        if (shift.startTime) {
            if (shift.startTime.startsWith('07:') || shift.startTime.startsWith('08:')) return 'M';
            if (shift.startTime.startsWith('14:') || shift.startTime.startsWith('15:')) return 'T';
            if (shift.startTime.startsWith('22:') || shift.startTime.startsWith('23:')) return 'N';
        }
        return null;
    }
    if (note.includes('(M)') || note.includes('MAÑANA')) return 'M';
    if (note.includes('(T)') || note.includes('TARDE')) return 'T';
    if (note.includes('(N)') || note.includes('NOCHE')) return 'N';
    // Updated to match potential new FDS Objetivo notes
    if (note.includes('D (FIJO SEMANAL)') || note.includes('D (DESCANSO)') || note.includes('D (FDS OBJETIVO)')) return 'D';
    if (note.startsWith('LAO')) return 'LAO';
    if (note.startsWith('LM')) return 'LM';
    if (note.includes('C (FRANCO COMP.)') || note.includes('C (COMPENSATORIO)')) return 'C'; // Added 'C (COMPENSATORIO)'
    if (note.includes('F (FERIADO') || note.includes('F (FDS OBJETIVO - FERIADO)')) return 'F';
    return null;
};


export async function generateAlgorithmicSchedule(
  service: Service,
  month: string,
  year: string,
  allEmployees: Employee[],
  holidays: Holiday[],
  previousMonthShifts: AIShift[] | null
): Promise<AlgorithmicScheduleOutput> {
  const generatedShifts: AIShift[] = [];
  const violations: ScheduleViolation[] = [];
  let score = 100;
  let scoreBreakdown: ScoreBreakdown = { serviceRules: 100, employeeWellbeing: 100 };

  const monthInt = parseInt(month, 10);
  const yearInt = parseInt(year, 10);
  const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));
  const firstDayOfCurrentMonth = new Date(yearInt, monthInt - 1, 1);

  const employeesForService = allEmployees.filter(emp => emp.serviceIds.includes(service.id));
  if (employeesForService.length === 0) {
    const noEmployeeViolation: ScheduleViolation = { rule: "Sin Empleados", details: `No hay empleados asignados al servicio ${service.name}`, severity: 'error', date: format(firstDayOfCurrentMonth, 'yyyy-MM-dd'), shiftType:'General', category: 'serviceRule' };
    return { 
      generatedShifts: [], 
      violations: [noEmployeeViolation], 
      score: 0, 
      scoreBreakdown: { serviceRules: 0, employeeWellbeing: 100 },
      responseText: `No hay empleados asignados al servicio ${service.name}.` 
    };
  }

  const employeeStates: Record<string, EmployeeState> = {};
  employeesForService.forEach(emp => {
    employeeStates[emp.id] = { 
        id: emp.id, 
        name: emp.name, 
        consecutiveWorkDays: 0, 
        consecutiveRestDays: 0, 
        shiftsThisMonth: 0, 
        lastShiftType: undefined, 
        lastActualWorkShiftEndTime: null,
        completeWeekendsOffThisMonth: 0,
    };
  });

  const lookbackDays = Math.max(service.consecutivenessRules?.maxConsecutiveWorkDays || 7, service.consecutivenessRules?.maxConsecutiveDaysOff || 7, 7);
  const sortedPreviousShifts = (previousMonthShifts || []).sort((a, b) => {
      const dateA = parseISO(a.date); const dateB = parseISO(b.date);
      if (dateA < dateB) return -1; if (dateA > dateB) return 1;
      return a.employeeName.localeCompare(b.employeeName);
  });

  for (const emp of employeesForService) {
    const state = employeeStates[emp.id];
    if (!state) continue;
    let currentConsecutiveWork = 0; let currentConsecutiveRest = 0;
    let lastTypeEncountered: EmployeeState['lastShiftType'] = undefined;
    let lastWorkShiftEnd: Date | null = null;

    for (let i = lookbackDays; i >= 1; i--) {
        const dateToCheck = subDays(firstDayOfCurrentMonth, i);
        const dateToCheckStr = format(dateToCheck, 'yyyy-MM-dd');
        const shiftsForEmpOnDate = sortedPreviousShifts.filter(s => s.date === dateToCheckStr && s.employeeName === emp.name);
        const shiftToday: AIShift | undefined = shiftsForEmpOnDate[0];

        if (shiftToday) {
            const note = shiftToday.notes?.toUpperCase() || '';
            let shiftCode: 'M' | 'T' | 'N' | undefined = undefined;
            if (note.includes('(M)')) shiftCode = 'M';
            else if (note.includes('(T)')) shiftCode = 'T';
            else if (note.includes('(N)')) shiftCode = 'N';

            if (shiftToday.startTime && shiftToday.endTime && shiftCode) { 
                currentConsecutiveWork = (lastTypeEncountered === 'M' || lastTypeEncountered === 'T' || lastTypeEncountered === 'N') ? currentConsecutiveWork + 1 : 1;
                currentConsecutiveRest = 0;
                lastTypeEncountered = shiftCode;
                const { endTime: shiftEndTimeStr } = getShiftDetails(shiftCode);
                lastWorkShiftEnd = getShiftDateTime(dateToCheck, shiftEndTimeStr, shiftCode === 'N');
            } else if (note.includes('D') || note.includes('LAO') || note.includes('LM') || note.includes('C') || note.includes('F') || note.includes('FERIADO')) { 
                currentConsecutiveRest = (lastTypeEncountered === 'D' || lastTypeEncountered === 'F' || lastTypeEncountered === 'LAO' || lastTypeEncountered === 'LM' || lastTypeEncountered === 'C' || lastTypeEncountered === undefined) ? currentConsecutiveRest + 1 : 1;
                currentConsecutiveWork = 0; 
                if (note.includes('LAO')) lastTypeEncountered = 'LAO';
                else if (note.includes('LM')) lastTypeEncountered = 'LM';
                else if (note.includes('C')) lastTypeEncountered = 'C';
                else if (note.includes('F') || note.includes('FERIADO')) lastTypeEncountered = 'F';
                else lastTypeEncountered = 'D';
            }
        } else { 
            currentConsecutiveRest = (lastTypeEncountered === 'D' || lastTypeEncountered === 'F' || lastTypeEncountered === 'LAO' || lastTypeEncountered === 'LM' || lastTypeEncountered === 'C' || lastTypeEncountered === undefined) ? currentConsecutiveRest + 1 : 1;
            currentConsecutiveWork = 0; lastTypeEncountered = 'D';
        }
    }
    state.consecutiveWorkDays = currentConsecutiveWork; 
    state.consecutiveRestDays = currentConsecutiveRest; 
    state.lastShiftType = lastTypeEncountered;
    state.lastActualWorkShiftEndTime = lastWorkShiftEnd;
  }

  for (let day = 1; day <= daysInMonthCount; day++) {
    const currentDate = new Date(yearInt, monthInt - 1, day);
    const currentDateStrYYYYMMDD = format(currentDate, 'yyyy-MM-dd');
    const currentDayOfWeekNum = getDay(currentDate); 
    const unnormalizedDayOfWeekName = format(currentDate, 'eeee', { locale: es });
    const currentDayOfWeekName = normalizeDayName(unnormalizedDayOfWeekName);
    const isWeekendDay = currentDayOfWeekNum === 0 || currentDayOfWeekNum === 6;

    const isHolidayDay = holidays.some(h => h.date === currentDateStrYYYYMMDD);
    const useWeekendHolidayStaffing = isWeekendDay || isHolidayDay;

    let staffingNeeds = {
      morning: useWeekendHolidayStaffing ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
      afternoon: useWeekendHolidayStaffing ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
      night: (service.enableNightShift && useWeekendHolidayStaffing) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
    };
    const dailyAssignedWorkShifts = new Set<string>(); 
    const dailyProcessedEmployees = new Set<string>();

    // 0. Process Work Patterns
    for (const emp of employeesForService) {
        const state = employeeStates[emp.id];
        const workPattern = emp.preferences?.workPattern;
        const isCurrentDayAWeekday = !isWeekendDay;

        if (workPattern === 'mondayToFridayMorning' || workPattern === 'mondayToFridayAfternoon') {
            const shiftCodeToAssign: 'M' | 'T' = workPattern === 'mondayToFridayMorning' ? 'M' : 'T';
            if (isCurrentDayAWeekday) {
                if (isHolidayDay) {
                    generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: 'F (Feriado - Patrón Fijo)' });
                    state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                    state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                } else {
                    if (!canAssignShiftDueToRest(state, shiftCodeToAssign, currentDate)) {
                        violations.push({
                            employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCodeToAssign,
                            rule: "Patrón Fijo Viola Descanso Mínimo",
                            details: `El patrón fijo de ${emp.name} (${shiftCodeToAssign}) viola la regla de 12h de descanso. Último turno laboral terminó ${state.lastActualWorkShiftEndTime ? format(state.lastActualWorkShiftEndTime, 'Pp', {locale:es}) : 'N/A'}. No se asignó el turno del patrón.`,
                            severity: 'error', category: 'employeeWellbeing'
                        });
                        score -= 10; scoreBreakdown.employeeWellbeing -= 10;
                    } else {
                        const { startTime, endTime, notesSuffix } = getShiftDetails(shiftCodeToAssign);
                        generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime, endTime, notes: `Turno Patrón ${notesSuffix}` });
                        dailyAssignedWorkShifts.add(emp.id); state.shiftsThisMonth++;
                        state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                        state.consecutiveRestDays = 0; state.lastShiftType = shiftCodeToAssign;
                        state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, shiftCodeToAssign === 'N');
                        if (shiftCodeToAssign === 'M') staffingNeeds.morning--; else if (shiftCodeToAssign === 'T') staffingNeeds.afternoon--;
                        dailyProcessedEmployees.add(emp.id);
                    }
                }
            } else { 
                generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: 'D (Descanso - Patrón Fijo)' });
                state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                state.consecutiveWorkDays = 0; state.lastShiftType = 'D';
                dailyProcessedEmployees.add(emp.id);
            }
        }
    }

    // 1. Process Fixed Absences (LAO/LM)
    employeesForService.forEach(emp => {
      if (dailyProcessedEmployees.has(emp.id)) return;
      const state = employeeStates[emp.id];
      const fixedAssignment = isEmployeeOnFixedAssignmentOnDate(emp, currentDate);
      if (fixedAssignment && (fixedAssignment.type === 'LAO' || fixedAssignment.type === 'LM')) {
        generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: `${fixedAssignment.type}${fixedAssignment.description ? ` - ${fixedAssignment.description}` : ''}` });
        dailyProcessedEmployees.add(emp.id);
        state.consecutiveRestDays = (state.lastShiftType === fixedAssignment.type || state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
        state.consecutiveWorkDays = 0; state.lastShiftType = fixedAssignment.type;
      }
    });

    // 2. Process Fixed Weekly Shifts (M, T, N, D) for 'standardRotation' employees
    employeesForService.forEach(emp => {
        if (dailyProcessedEmployees.has(emp.id)) return; 
        
        const workPattern = emp.preferences?.workPattern;
        if (workPattern && workPattern !== 'standardRotation') return; 

        const state = employeeStates[emp.id]; 
        const preferences = emp.preferences;

        if (preferences?.fixedWeeklyShiftDays && preferences.fixedWeeklyShiftDays.includes(currentDayOfWeekName)) {
            const fixedTiming = preferences.fixedWeeklyShiftTiming;
            if (fixedTiming && fixedTiming !== NO_FIXED_TIMING_VALUE) {
                const maxWorkDays = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
                const minRestDaysRequired = service.consecutivenessRules?.minConsecutiveDaysOffRequiredBeforeWork || 1;

                if (fixedTiming === REST_DAY_VALUE || fixedTiming.toUpperCase() === 'D') {
                    const shiftNote = isHolidayDay ? 'F (Feriado - Descanso Fijo)' : 'D (Fijo Semanal)';
                    const lastShiftTypeForState: EmployeeState['lastShiftType'] = isHolidayDay ? 'F' : 'D';
                    generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: shiftNote });
                    dailyProcessedEmployees.add(emp.id);
                    state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                    state.consecutiveWorkDays = 0; state.lastShiftType = lastShiftTypeForState;
                } else if (['mañana', 'tarde', 'noche'].includes(fixedTiming.toLowerCase())) {
                    const shiftCode = fixedTiming.toLowerCase().charAt(0).toUpperCase() as 'M' | 'T' | 'N';
                    
                    if (shiftCode === 'N' && !service.enableNightShift) {
                        violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode, rule: "Error de Configuración de Turno Fijo", details: `Turno fijo 'N' para ${emp.name} pero el servicio no tiene turno noche habilitado. No se asignó.`, severity: 'error', category: 'serviceRule' }); score -= 5; scoreBreakdown.serviceRules -= 5;
                        return; 
                    }
                    
                    if (!canAssignShiftDueToRest(state, shiftCode, currentDate)) {
                        violations.push({
                            employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode,
                            rule: "Preferencia Fija Viola Descanso Mínimo",
                            details: `La preferencia de turno fijo para ${emp.name} (${shiftCode} el ${unnormalizedDayOfWeekName}) no se asignó porque viola la regla de 12h de descanso (Turno anterior: ${state.lastShiftType || 'N/A'} finalizó ${state.lastActualWorkShiftEndTime ? format(state.lastActualWorkShiftEndTime, 'Pp', {locale:es}) : 'N/A'}).`,
                            severity: 'error', category: 'employeeWellbeing'
                        });
                        score -= 10; scoreBreakdown.employeeWellbeing -= 10;
                        return; 
                    }

                    if (isHolidayDay && !isWeekendDay) { 
                        generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: `F (Feriado - Cubría ${shiftCode})` });
                        dailyProcessedEmployees.add(emp.id);
                        state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                        state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                    } else { 
                        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftCode);
                        const wasRestingFixed = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
                        if (state.consecutiveWorkDays + 1 > maxWorkDays) {
                            violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode, rule: "Violación Consecutividad por Turno Fijo", details: `Turno fijo ${shiftCode} asignado a ${emp.name} causa ${state.consecutiveWorkDays + 1}/${maxWorkDays} días trabajo.`, severity: 'warning', category: 'serviceRule' }); score -= 2; scoreBreakdown.serviceRules -= 2; 
                        }
                        if (wasRestingFixed && state.consecutiveRestDays < minRestDaysRequired) {
                             violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode, rule: "Violación Descanso Mín. por Turno Fijo", details: `Turno fijo ${shiftCode} asignado a ${emp.name} viola mín. días de descanso (${state.consecutiveRestDays}/${minRestDaysRequired}).`, severity: 'warning', category: 'serviceRule' }); score -= 2; scoreBreakdown.serviceRules -= 2;
                        }

                        generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime, endTime, notes: `Turno Fijo ${notesSuffix}` });
                        dailyAssignedWorkShifts.add(emp.id); dailyProcessedEmployees.add(emp.id); state.shiftsThisMonth++;
                        state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                        state.consecutiveRestDays = 0; state.lastShiftType = shiftCode;
                        state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, shiftCode === 'N');
                        if (shiftCode === 'M') staffingNeeds.morning--; else if (shiftCode === 'T') staffingNeeds.afternoon--; else if (shiftCode === 'N') staffingNeeds.night--;
                    }
                }
            }
        }
    });

    // 3. Assign remaining shifts
    const assignShiftsForType = (shiftType: 'M' | 'T' | 'N', getNeeded: () => number, decrementNeeded: () => void, notesDetail: string) => {
      let needed = getNeeded(); if (needed <= 0) return;
      const {startTime, endTime, notesSuffix} = getShiftDetails(shiftType);
      const maxWorkDays = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
      const minRestDaysRequired = service.consecutivenessRules?.minConsecutiveDaysOffRequiredBeforeWork || 1;
      const preferredRestDays = service.consecutivenessRules?.preferredConsecutiveDaysOff || minRestDaysRequired;
      const preferredWorkDays = service.consecutivenessRules?.preferredConsecutiveWorkDays || maxWorkDays;

      const availableForWork = employeesForService
        .filter(emp => !dailyProcessedEmployees.has(emp.id) && !dailyAssignedWorkShifts.has(emp.id))
        .filter(emp => {
            const state = employeeStates[emp.id];
            if (!canAssignShiftDueToRest(state, shiftType, currentDate)) return false; 
            const wasResting = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
            const hasEnoughMinRest = wasResting ? state.consecutiveRestDays >= minRestDaysRequired : true;
            if (state.consecutiveWorkDays >= maxWorkDays) return false;
            return hasEnoughMinRest;
        })
        .sort((a, b) => {
            const stateA = employeeStates[a.id]; const stateB = employeeStates[b.id];
            const aWasResting = (stateA.lastShiftType === 'D' || stateA.lastShiftType === 'F' || stateA.lastShiftType === 'C' || stateA.lastShiftType === 'LAO' || stateA.lastShiftType === 'LM' || stateA.lastShiftType === undefined);
            const bWasResting = (stateB.lastShiftType === 'D' || stateB.lastShiftType === 'F' || stateB.lastShiftType === 'C' || stateB.lastShiftType === 'LAO' || stateB.lastShiftType === 'LM' || stateB.lastShiftType === undefined);
            
            const aMetPreferredRest = aWasResting ? stateA.consecutiveRestDays >= preferredRestDays : false;
            const bMetPreferredRest = bWasResting ? stateB.consecutiveRestDays >= preferredRestDays : false;

            if (aMetPreferredRest && !bMetPreferredRest) return -1; 
            if (!aMetPreferredRest && bMetPreferredRest) return 1;  
            
            const aIsContinuingPreferredWorkBlock = !aWasResting && stateA.consecutiveWorkDays < preferredWorkDays;
            const bIsContinuingPreferredWorkBlock = !bWasResting && stateB.consecutiveWorkDays < preferredWorkDays;

            if (aIsContinuingPreferredWorkBlock && !bIsContinuingPreferredWorkBlock) return -1;
            if (!aIsContinuingPreferredWorkBlock && bIsContinuingPreferredWorkBlock) return 1;
            
            // Consider targetCompleteWeekendsOff: give slight preference to those who *prefer* weekend work if target is active
            if (useWeekendHolidayStaffing && service.targetCompleteWeekendsOff && service.targetCompleteWeekendsOff > 0) {
                const prefersWeekendA = a.preferences?.prefersWeekendWork ?? false;
                const prefersWeekendB = b.preferences?.prefersWeekendWork ?? false;
                if (prefersWeekendA && !prefersWeekendB) return -1; // A (prefers) comes before B (doesn't or no pref)
                if (!prefersWeekendA && prefersWeekendB) return 1;  // B (prefers) comes before A
            }

            if (stateA.shiftsThisMonth !== stateB.shiftsThisMonth) return stateA.shiftsThisMonth - stateB.shiftsThisMonth;

            // General preference for weekend work if targetCompleteWeekendsOff is not a factor or already considered
            if (useWeekendHolidayStaffing) {
                const prefersA = a.preferences?.prefersWeekendWork ?? false; 
                const prefersB = b.preferences?.prefersWeekendWork ?? false;
                if (prefersA && !prefersB) return -1; 
                if (!prefersA && prefersB) return 1;
            }
            
            if (aWasResting && bWasResting) {
                 if (stateA.consecutiveRestDays > stateB.consecutiveRestDays) return -1;
                 if (stateA.consecutiveRestDays < stateB.consecutiveRestDays) return 1;  
            } else if (aWasResting && !bWasResting) return -1;
            else if (!aWasResting && bWasResting) return 1; 

            if (!aWasResting && !bWasResting && stateA.consecutiveWorkDays !== stateB.consecutiveWorkDays) {
                return stateA.consecutiveWorkDays - stateB.consecutiveWorkDays;
            }
            return Math.random() - 0.5; 
        });

      for (const emp of availableForWork) {
        if (needed <= 0) break;
        const state = employeeStates[emp.id];
        const wasResting = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
        
        if (wasResting && state.consecutiveRestDays < preferredRestDays && service.consecutivenessRules?.preferredConsecutiveDaysOff) {
            violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftType, rule: "Bloque de Descanso Preferido Interrumpido", details: `Inicia trabajo con ${state.consecutiveRestDays} días de descanso (preferido: ${preferredRestDays}).`, severity: 'warning', category: 'employeeWellbeing' }); score -= 1; scoreBreakdown.employeeWellbeing -=1;
        }
        if (!wasResting && state.consecutiveWorkDays +1 > preferredWorkDays && state.consecutiveWorkDays < maxWorkDays) {
             violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftType, rule: "Bloque de Trabajo Preferido Excedido", details: `Trabajará ${state.consecutiveWorkDays + 1} días (preferido: ${preferredWorkDays}).`, severity: 'warning', category: 'employeeWellbeing' }); score -=1; scoreBreakdown.employeeWellbeing -=1;
        }

        generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: startTime, endTime: endTime, notes: `${notesDetail} ${notesSuffix}` });
        dailyAssignedWorkShifts.add(emp.id); dailyProcessedEmployees.add(emp.id); state.shiftsThisMonth++;
        state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
        state.consecutiveRestDays = 0; state.lastShiftType = shiftType;
        state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, shiftType === 'N');
        decrementNeeded(); needed = getNeeded();
      }
    };

    assignShiftsForType('M', () => staffingNeeds.morning, () => staffingNeeds.morning--, "Turno Mañana");
    assignShiftsForType('T', () => staffingNeeds.afternoon, () => staffingNeeds.afternoon--, "Turno Tarde");
    if (service.enableNightShift) assignShiftsForType('N', () => staffingNeeds.night, () => staffingNeeds.night--, "Turno Noche");

    // 4. Check for remaining staffing needs
    if (staffingNeeds.morning > 0) { violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'M', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.morning} empleado(s) para Mañana.`, severity: 'error', category: 'serviceRule' }); score -= staffingNeeds.morning * 5; scoreBreakdown.serviceRules -= staffingNeeds.morning * 5;}
    if (staffingNeeds.afternoon > 0) { violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'T', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.afternoon} empleado(s) para Tarde.`, severity: 'error', category: 'serviceRule' }); score -= staffingNeeds.afternoon * 5; scoreBreakdown.serviceRules -= staffingNeeds.afternoon * 5;}
    if (service.enableNightShift && staffingNeeds.night > 0) { violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'N', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.night} empleado(s) para Noche.`, severity: 'error', category: 'serviceRule' }); score -= staffingNeeds.night * 5; scoreBreakdown.serviceRules -= staffingNeeds.night * 5;}

    // 5. Safeguard
    employeesForService.forEach(emp => {
        if (!dailyProcessedEmployees.has(emp.id)) { 
            const preferences = emp.preferences;
            const workPattern = preferences?.workPattern;
            const isCurrentDayAWeekday = !isWeekendDay;

            if ((workPattern === 'mondayToFridayMorning' || workPattern === 'mondayToFridayAfternoon') && isCurrentDayAWeekday && !isHolidayDay) {
                 violations.push({ 
                    employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General', 
                    rule: "Error Interno del Algoritmo", 
                    details: `El empleado ${emp.name} tiene un patrón de trabajo fijo L-V (${workPattern}) para hoy pero no fue procesado (posiblemente por violar regla de 12h). Se evita asignación de descanso. Revise la lógica.`, 
                    severity: 'error', category: 'serviceRule'
                });
                score -= 20; scoreBreakdown.serviceRules -= 20; dailyProcessedEmployees.add(emp.id); return;
            }
            
            if ((!workPattern || workPattern === 'standardRotation') && preferences?.fixedWeeklyShiftDays && preferences.fixedWeeklyShiftDays.includes(currentDayOfWeekName)) {
                const fixedTiming = preferences.fixedWeeklyShiftTiming;
                if (fixedTiming && fixedTiming !== NO_FIXED_TIMING_VALUE && fixedTiming !== REST_DAY_VALUE && fixedTiming.toUpperCase() !== 'D') {
                    const isFixedWorkShiftOnHolidayThatWasHandledAsF = isHolidayDay && !isWeekendDay && (['mañana', 'tarde', 'noche'].includes(fixedTiming.toLowerCase()));
                    if (!isFixedWorkShiftOnHolidayThatWasHandledAsF) { 
                        violations.push({ 
                            employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General', 
                            rule: "Error Interno del Algoritmo", 
                            details: `El empleado ${emp.name} tiene un turno de trabajo fijo (${fixedTiming}) para hoy (${currentDayOfWeekName}) pero no fue procesado (posiblemente por violar regla de 12h). Se evita asignación de descanso. Revise sus preferencias y la lógica.`, 
                            severity: 'error', category: 'serviceRule'
                        });
                        score -= 20; scoreBreakdown.serviceRules -= 20; dailyProcessedEmployees.add(emp.id);
                    }
                }
            }
        }
    });

    // 6. Assign rest days ('D' or 'F') to remaining employees
    employeesForService.forEach(emp => {
      const state = employeeStates[emp.id];
      if (!dailyProcessedEmployees.has(emp.id)) { 
        const maxRestDays = service.consecutivenessRules?.maxConsecutiveDaysOff || 7;
        const preferredWorkDays = service.consecutivenessRules?.preferredConsecutiveWorkDays || (service.consecutivenessRules?.maxConsecutiveWorkDays || 7);
        const isLastShiftWorkType = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N');

        if (isLastShiftWorkType && state.consecutiveWorkDays < preferredWorkDays) {
            violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General', rule: "Bloque de Trabajo Preferido Interrumpido", details: `Descansa después de ${state.consecutiveWorkDays} días de trabajo (preferido: ${preferredWorkDays}).`, severity: 'warning', category: 'employeeWellbeing' }); score -= 1; scoreBreakdown.employeeWellbeing -=1;
        }
        
        const isLastShiftRestType = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
        if (isLastShiftRestType && state.consecutiveRestDays >= maxRestDays) {
             violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General', rule: "Exceso Descansos Consecutivos (Forzado a Trabajo)", details: `Excedió máx. descansos (${state.consecutiveRestDays}/${maxRestDays}), pero no se pudo asignar trabajo. Se asigna descanso/feriado.`, severity: 'warning', category: 'serviceRule' }); score -= 1; scoreBreakdown.serviceRules -= 1;
        }
        
        let shiftNote = isHolidayDay ? 'F (Feriado)' : 'D (Descanso)';
        const lastShiftTypeForState: EmployeeState['lastShiftType'] = isHolidayDay ? 'F' : 'D';

        // Check for completed weekend off objective for note adjustment
        if (currentDayOfWeekNum === 0 && service.targetCompleteWeekendsOff && service.targetCompleteWeekendsOff > 0) { // It's a Sunday
            const saturdayStr = format(subDays(currentDate, 1), 'yyyy-MM-dd');
            const saturdayShift = generatedShifts.find(s => s.employeeName === emp.name && s.date === saturdayStr);
            if (saturdayShift) {
                const saturdayShiftType = getShiftTypeForEval(saturdayShift);
                if (saturdayShiftType === 'D' || saturdayShiftType === 'F' || saturdayShiftType === 'LAO' || saturdayShiftType === 'LM' || saturdayShiftType === 'C') {
                    shiftNote = isHolidayDay ? 'F (FDS Objetivo - Feriado)' : 'D (FDS Objetivo)';
                }
            }
        }

        generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: shiftNote });
        dailyProcessedEmployees.add(emp.id); 

        state.consecutiveRestDays = isLastShiftRestType ? state.consecutiveRestDays + 1 : 1;
        state.consecutiveWorkDays = 0;
        state.lastShiftType = lastShiftTypeForState;
      } else if (dailyAssignedWorkShifts.has(emp.id)) { 
        const maxWork = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
        if (state.consecutiveWorkDays > maxWork) { 
            violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: state.lastShiftType as 'M'|'T'|'N' || 'General', rule: "Exceso Días Trabajo Consecutivos", details: `Trabajó ${state.consecutiveWorkDays} días (máx: ${maxWork}).`, severity: 'error', category: 'serviceRule' }); score -= 10; scoreBreakdown.serviceRules -= 10;
        }
      }
    });
  }

  // Evaluate targetCompleteWeekendsOff after all shifts are assigned
  if (service.targetCompleteWeekendsOff && service.targetCompleteWeekendsOff > 0) {
    employeesForService.forEach(emp => {
      let completeWeekendsOffCount = 0;
      for (let dayIter = 1; dayIter <= daysInMonthCount; dayIter++) { // Renamed loop variable
        const date = new Date(yearInt, monthInt - 1, dayIter);
        if (getDay(date) === 6) { // It's a Saturday
          const saturdayStr = format(date, 'yyyy-MM-dd');
          const sundayStr = format(addDays(date, 1), 'yyyy-MM-dd');

          // Ensure Sunday is within the current month
          if (addDays(date, 1).getMonth() === monthInt -1) {
            const saturdayShift = generatedShifts.find(s => s.employeeName === emp.name && s.date === saturdayStr);
            const sundayShift = generatedShifts.find(s => s.employeeName === emp.name && s.date === sundayStr);

            if (saturdayShift && sundayShift) {
              const satShiftType = getShiftTypeForEval(saturdayShift);
              const sunShiftType = getShiftTypeForEval(sundayShift);
              
              const isSatOff = satShiftType === 'D' || satShiftType === 'F' || satShiftType === 'LAO' || satShiftType === 'LM' || satShiftType === 'C';
              const isSunOff = sunShiftType === 'D' || sunShiftType === 'F' || sunShiftType === 'LAO' || sunShiftType === 'LM' || sunShiftType === 'C';

              if (isSatOff && isSunOff) {
                completeWeekendsOffCount++;
              }
            }
          }
        }
      }
      employeeStates[emp.id].completeWeekendsOffThisMonth = completeWeekendsOffCount; 

      if (completeWeekendsOffCount < service.targetCompleteWeekendsOff) {
        violations.push({
          employeeName: emp.name,
          rule: "Objetivo FDS Descanso No Alcanzado",
          details: `${emp.name} tuvo ${completeWeekendsOffCount} FDS de descanso completo (Objetivo: ${service.targetCompleteWeekendsOff}).`,
          severity: 'warning',
          category: 'employeeWellbeing',
          shiftType: 'General',
          date: `${year}-${String(monthInt).padStart(2,'0')}` 
        });
        score -= 1; 
        scoreBreakdown.employeeWellbeing -= 1;
      }
    });
  }


  const monthName = format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es });
  const finalScore = Math.max(0, Math.min(100, score));
  scoreBreakdown.serviceRules = Math.max(0, Math.min(100, scoreBreakdown.serviceRules));
  scoreBreakdown.employeeWellbeing = Math.max(0, Math.min(100, scoreBreakdown.employeeWellbeing));

  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  let responseSummary = `Horario generado para ${service.name} (${monthName}). Puntuación General: ${finalScore.toFixed(0)}/100.`;
  responseSummary += ` [Reglas Servicio: ${scoreBreakdown.serviceRules.toFixed(0)}/100, Bienestar Personal: ${scoreBreakdown.employeeWellbeing.toFixed(0)}/100].`;
  if (errorCount > 0) responseSummary += ` Errores: ${errorCount}.`;
  if (warningCount > 0) responseSummary += ` Advertencias: ${warningCount}.`;
  if (errorCount === 0 && warningCount === 0) responseSummary += " ¡Sin errores ni advertencias notables!";

  return { generatedShifts, responseText: responseSummary, violations, score: finalScore, scoreBreakdown };
}

    
