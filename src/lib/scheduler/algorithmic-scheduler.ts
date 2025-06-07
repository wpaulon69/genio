
'use server';

import type { Service, Employee, FixedAssignment, Holiday, ScheduleViolation, AIShift, WorkPattern } from '@/lib/types';
import { format, getDaysInMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getDay, subDays, isValid, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { SHIFT_OPTIONS } from '@/lib/constants/schedule-constants';

interface AlgorithmicScheduleOutput {
  generatedShifts: AIShift[];
  responseText: string;
  violations: ScheduleViolation[];
  score: number;
}

interface EmployeeState {
  id: string;
  name: string;
  consecutiveWorkDays: number;
  consecutiveRestDays: number;
  shiftsThisMonth: number;
  lastShiftType?: AIShift['notes'] | 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F';
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

const normalizeDayName = (dayName: string): string => {
  if (!dayName) return '';
  return dayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

  const monthInt = parseInt(month, 10);
  const yearInt = parseInt(year, 10);
  const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));
  const firstDayOfCurrentMonth = new Date(yearInt, monthInt - 1, 1);

  const employeesForService = allEmployees.filter(emp => emp.serviceIds.includes(service.id));
  if (employeesForService.length === 0) {
    return { generatedShifts: [], violations: [{ rule: "Sin Empleados", details: `No hay empleados asignados al servicio ${service.name}`, severity: 'error', date: format(firstDayOfCurrentMonth, 'yyyy-MM-dd'), shiftType:'General' }], score: 0, responseText: `No hay empleados asignados al servicio ${service.name}.` };
  }

  const employeeStates: Record<string, EmployeeState> = {};
  employeesForService.forEach(emp => {
    employeeStates[emp.id] = { id: emp.id, name: emp.name, consecutiveWorkDays: 0, consecutiveRestDays: 0, shiftsThisMonth: 0, lastShiftType: undefined };
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
    for (let i = lookbackDays; i >= 1; i--) {
        const dateToCheck = subDays(firstDayOfCurrentMonth, i);
        const dateToCheckStr = format(dateToCheck, 'yyyy-MM-dd');
        const shiftsForEmpOnDate = sortedPreviousShifts.filter(s => s.date === dateToCheckStr && s.employeeName === emp.name);
        const shiftToday: AIShift | undefined = shiftsForEmpOnDate[0];
        if (shiftToday) {
            const note = shiftToday.notes?.toUpperCase() || '';
            if (shiftToday.startTime && shiftToday.endTime) { 
                currentConsecutiveWork = (lastTypeEncountered === 'M' || lastTypeEncountered === 'T' || lastTypeEncountered === 'N') ? currentConsecutiveWork + 1 : 1;
                currentConsecutiveRest = 0;
                if (note.includes('(M)')) lastTypeEncountered = 'M'; else if (note.includes('(T)')) lastTypeEncountered = 'T'; else if (note.includes('(N)')) lastTypeEncountered = 'N'; else lastTypeEncountered = 'M';
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
    state.consecutiveWorkDays = currentConsecutiveWork; state.consecutiveRestDays = currentConsecutiveRest; state.lastShiftType = lastTypeEncountered;
  }

  for (let day = 1; day <= daysInMonthCount; day++) {
    const currentDate = new Date(yearInt, monthInt - 1, day);
    const currentDateStrYYYYMMDD = format(currentDate, 'yyyy-MM-dd');
    const currentDayOfWeekNum = getDay(currentDate); // 0 (Sun) to 6 (Sat)
    const unnormalizedDayOfWeekName = format(currentDate, 'eeee', { locale: es });
    const currentDayOfWeekName = normalizeDayName(unnormalizedDayOfWeekName);

    const isHolidayDay = holidays.some(h => h.date === currentDateStrYYYYMMDD);
    const isWeekendDay = currentDayOfWeekNum === 0 || currentDayOfWeekNum === 6;
    const useWeekendHolidayStaffing = isWeekendDay || isHolidayDay;

    let staffingNeeds = {
      morning: useWeekendHolidayStaffing ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
      afternoon: useWeekendHolidayStaffing ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
      night: (service.enableNightShift && useWeekendHolidayStaffing) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
    };
    const dailyAssignedWorkShifts = new Set<string>(); 
    const dailyProcessedEmployees = new Set<string>();

    // 0. Process Work Patterns (highest priority)
    for (const emp of employeesForService) {
        const state = employeeStates[emp.id];
        const workPattern = emp.preferences?.workPattern;
        const isCurrentDayAWeekday = !isWeekendDay; // Mon-Fri

        if (workPattern === 'mondayToFridayMorning' || workPattern === 'mondayToFridayAfternoon') {
            const shiftCodeToAssign: 'M' | 'T' = workPattern === 'mondayToFridayMorning' ? 'M' : 'T';
            if (isCurrentDayAWeekday) {
                if (isHolidayDay) {
                    generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: 'F (Feriado - Patrón Fijo)' });
                    state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                    state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                } else {
                    const { startTime, endTime, notesSuffix } = getShiftDetails(shiftCodeToAssign);
                    generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime, endTime, notes: `Turno Patrón ${notesSuffix}` });
                    dailyAssignedWorkShifts.add(emp.id); state.shiftsThisMonth++;
                    state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                    state.consecutiveRestDays = 0; state.lastShiftType = shiftCodeToAssign;
                    if (shiftCodeToAssign === 'M') staffingNeeds.morning--; else if (shiftCodeToAssign === 'T') staffingNeeds.afternoon--;
                }
            } else { // Weekend
                generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: 'D (Descanso - Patrón Fijo)' });
                state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                state.consecutiveWorkDays = 0; state.lastShiftType = 'D';
            }
            dailyProcessedEmployees.add(emp.id);
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

    // 2. Process Fixed Weekly Shifts (M, T, N, D) for employees on 'standardRotation'
    employeesForService.forEach(emp => {
        if (dailyProcessedEmployees.has(emp.id)) return; 
        const workPattern = emp.preferences?.workPattern;
        if (workPattern && workPattern !== 'standardRotation') return; // Skip if already handled by a fixed L-V pattern

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
                        violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode, rule: "Error de Configuración de Turno Fijo", details: `Turno fijo 'N' para ${emp.name} pero el servicio no tiene turno noche habilitado. No se asignó.`, severity: 'error' }); score -= 5;
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
                        let forcedViolation = false;
                        if (state.consecutiveWorkDays + 1 > maxWorkDays) {
                            violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode, rule: "Violación de Regla por Turno Fijo", details: `Turno fijo ${shiftCode} asignado a ${emp.name} viola máx. días de trabajo (${state.consecutiveWorkDays + 1}/${maxWorkDays}). ¡REVISAR PREFERENCIAS FIJAS!`, severity: 'error' }); score -= 10; forcedViolation = true;
                        }
                        if (wasRestingFixed && state.consecutiveRestDays < minRestDaysRequired) {
                            violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode, rule: "Violación de Regla por Turno Fijo", details: `Turno fijo ${shiftCode} asignado a ${emp.name} viola mín. días de descanso (${state.consecutiveRestDays}/${minRestDaysRequired}). ¡REVISAR PREFERENCIAS FIJAS!`, severity: 'error' }); score -= 10; forcedViolation = true;
                        }

                        generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime, endTime, notes: `Turno Fijo ${notesSuffix}${forcedViolation ? ' (Forzado por Regla)' : ''}` });
                        dailyAssignedWorkShifts.add(emp.id); dailyProcessedEmployees.add(emp.id); state.shiftsThisMonth++;
                        state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                        state.consecutiveRestDays = 0; state.lastShiftType = shiftCode;
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

      const availableForWork = employeesForService
        .filter(emp => !dailyProcessedEmployees.has(emp.id) && !dailyAssignedWorkShifts.has(emp.id))
        .filter(emp => {
            const state = employeeStates[emp.id];
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

            if (stateA.shiftsThisMonth !== stateB.shiftsThisMonth) return stateA.shiftsThisMonth - stateB.shiftsThisMonth;

            if (useWeekendHolidayStaffing) {
                const prefersA = a.preferences?.prefersWeekendWork ?? false; const prefersB = b.preferences?.prefersWeekendWork ?? false;
                if (prefersA && !prefersB) return -1; if (!prefersA && prefersB) return 1;
            }
            
            if (aWasResting && bWasResting) {
                 if (stateA.consecutiveRestDays > stateB.consecutiveRestDays) return -1; 
                 if (stateA.consecutiveRestDays < stateB.consecutiveRestDays) return 1;  
            } else if (aWasResting && !bWasResting) return -1; 
            else if (!aWasResting && bWasResting) return 1; 

            if (stateA.consecutiveWorkDays !== stateB.consecutiveWorkDays) return stateA.consecutiveWorkDays - stateB.consecutiveWorkDays;

            return Math.random() - 0.5; 
        });

      for (const emp of availableForWork) {
        if (needed <= 0) break;
        const state = employeeStates[emp.id];
        const wasResting = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
        
        if (wasResting && state.consecutiveRestDays < preferredRestDays && service.consecutivenessRules?.preferredConsecutiveDaysOff) {
            violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftType, rule: "Descanso Preferido No Cumplido", details: `Inicia trabajo con ${state.consecutiveRestDays} días de descanso (preferido: ${preferredRestDays}).`, severity: 'warning' }); score -= 2;
        }
        if (state.consecutiveWorkDays +1 > (service.consecutivenessRules?.preferredConsecutiveWorkDays || maxWorkDays) && state.consecutiveWorkDays < maxWorkDays) {
             violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftType, rule: "Trabajo Preferido Excedido", details: `Trabajará ${state.consecutiveWorkDays + 1} días (preferido: ${service.consecutivenessRules?.preferredConsecutiveWorkDays || maxWorkDays}).`, severity: 'warning' }); score -=1;
        }

        generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: startTime, endTime: endTime, notes: `${notesDetail} ${notesSuffix}` });
        dailyAssignedWorkShifts.add(emp.id); dailyProcessedEmployees.add(emp.id); state.shiftsThisMonth++;
        state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
        state.consecutiveRestDays = 0; state.lastShiftType = shiftType;
        decrementNeeded(); needed = getNeeded();
      }
    };

    assignShiftsForType('M', () => staffingNeeds.morning, () => staffingNeeds.morning--, "Turno Mañana");
    assignShiftsForType('T', () => staffingNeeds.afternoon, () => staffingNeeds.afternoon--, "Turno Tarde");
    if (service.enableNightShift) assignShiftsForType('N', () => staffingNeeds.night, () => staffingNeeds.night--, "Turno Noche");

    // 4. Check for remaining staffing needs
    if (staffingNeeds.morning > 0) { violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'M', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.morning} empleado(s) para Mañana.`, severity: 'error' }); score -= staffingNeeds.morning * 5; }
    if (staffingNeeds.afternoon > 0) { violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'T', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.afternoon} empleado(s) para Tarde.`, severity: 'error' }); score -= staffingNeeds.afternoon * 5; }
    if (service.enableNightShift && staffingNeeds.night > 0) { violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'N', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.night} empleado(s) para Noche.`, severity: 'error' }); score -= staffingNeeds.night * 5; }

    // 5. Safeguard: Check if any employee with a fixed WORK shift for today was not processed.
    employeesForService.forEach(emp => {
        if (!dailyProcessedEmployees.has(emp.id)) { 
            const preferences = emp.preferences;
            const workPattern = preferences?.workPattern;
            const isCurrentDayAWeekday = !isWeekendDay;

            // Check for unprocessed workPattern
            if ((workPattern === 'mondayToFridayMorning' || workPattern === 'mondayToFridayAfternoon') && isCurrentDayAWeekday && !isHolidayDay) {
                 violations.push({ 
                    employeeName: emp.name, 
                    date: currentDateStrYYYYMMDD, 
                    shiftType: 'General', 
                    rule: "Error Interno: Patrón de Trabajo Fijo no procesado", 
                    details: `El empleado ${emp.name} tiene un patrón de trabajo fijo L-V (${workPattern}) para hoy pero no fue procesado. No se le asignará descanso automático. Revise la lógica del algoritmo.`, 
                    severity: 'error' 
                });
                score -= 20; 
                dailyProcessedEmployees.add(emp.id); // Avoid D assignment
                return; // Skip further checks for this employee today
            }
            
            // Check for unprocessed daily fixed WORK shifts (only if standardRotation)
            if ((!workPattern || workPattern === 'standardRotation') && preferences?.fixedWeeklyShiftDays && preferences.fixedWeeklyShiftDays.includes(currentDayOfWeekName)) {
                const fixedTiming = preferences.fixedWeeklyShiftTiming;
                if (fixedTiming && fixedTiming !== NO_FIXED_TIMING_VALUE && fixedTiming !== REST_DAY_VALUE && fixedTiming.toUpperCase() !== 'D') {
                    const isFixedWorkShiftOnHolidayNotProcessed = isHolidayDay && !isWeekendDay && (['mañana', 'tarde', 'noche'].includes(fixedTiming.toLowerCase()));
                    if (!isFixedWorkShiftOnHolidayNotProcessed) { 
                        violations.push({ 
                            employeeName: emp.name, 
                            date: currentDateStrYYYYMMDD, 
                            shiftType: 'General', 
                            rule: "Error Interno: Turno fijo de trabajo no procesado", 
                            details: `El empleado ${emp.name} tiene un turno de trabajo fijo (${fixedTiming}) para hoy (${currentDayOfWeekName}) pero no fue procesado en la etapa de turnos fijos. No se le asignará descanso automático. Revise sus preferencias y la lógica del algoritmo.`, 
                            severity: 'error' 
                        });
                        score -= 20; 
                        dailyProcessedEmployees.add(emp.id); // Avoid D assignment
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
        const isLastShiftRestType = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;

        if (isLastShiftRestType && state.consecutiveRestDays >= maxRestDays) {
             violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General', rule: "Exceso Descansos Consecutivos (Forzado a Trabajo)", details: `Excedió máx. descansos (${state.consecutiveRestDays}/${maxRestDays}), pero no se pudo asignar trabajo. Se asigna descanso/feriado.`, severity: 'warning' }); score -= 1;
        }
        
        const shiftNote = isHolidayDay ? 'F (Feriado)' : 'D (Descanso)';
        const lastShiftTypeForState: EmployeeState['lastShiftType'] = isHolidayDay ? 'F' : 'D';

        generatedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: shiftNote });
        dailyProcessedEmployees.add(emp.id); 

        state.consecutiveRestDays = isLastShiftRestType ? state.consecutiveRestDays + 1 : 1;
        state.consecutiveWorkDays = 0;
        state.lastShiftType = lastShiftTypeForState;

      } else if (dailyAssignedWorkShifts.has(emp.id)) { 
        const maxWork = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
        if (state.consecutiveWorkDays > maxWork) { 
            violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: state.lastShiftType as 'M'|'T'|'N' || 'General', rule: "Exceso Días Trabajo Consecutivos", details: `Trabajó ${state.consecutiveWorkDays} días (máx: ${maxWork}).`, severity: 'error' }); score -= 10;
        }
      }
    });
  }

  const monthName = format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es });
  const finalScore = Math.max(0, Math.min(100, score));
  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  let responseSummary = `Horario generado para ${service.name} (${monthName}). Puntuación: ${finalScore}/100.`;
  if (errorCount > 0) responseSummary += ` Errores: ${errorCount}.`;
  if (warningCount > 0) responseSummary += ` Advertencias: ${warningCount}.`;
  if (errorCount === 0 && warningCount === 0) responseSummary += " ¡Sin errores ni advertencias notables!";

  return { generatedShifts, responseText: responseSummary, violations, score: finalScore };
}
