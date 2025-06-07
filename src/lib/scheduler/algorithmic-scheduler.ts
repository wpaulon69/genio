
'use server';

import type { Service, Employee, FixedAssignment, Holiday, ScheduleViolation } from '@/lib/types';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule';
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
  lastShiftType?: AIShift['notes'] | 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C';
}

const DAYS_OF_WEEK_MAP: { [key: string]: number } = {
    'domingo': 0,
    'lunes': 1,
    'martes': 2,
    'miercoles': 3,
    'jueves': 4,
    'viernes': 5,
    'sabado': 6,
};

const NO_FIXED_TIMING_VALUE = "none_selected";
const REST_DAY_VALUE = "rest_day";

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
    return { generatedShifts: [], violations: [], score: 0, responseText: `No hay empleados asignados al servicio ${service.name} para generar el horario.` };
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
    };
  });

  const lookbackDays = Math.max(service.consecutivenessRules?.maxConsecutiveWorkDays || 7, service.consecutivenessRules?.maxConsecutiveDaysOff || 7, 7);
  const sortedPreviousShifts = (previousMonthShifts || []).sort((a, b) => {
      const dateA = parseISO(a.date);
      const dateB = parseISO(b.date);
      if (dateA < dateB) return -1;
      if (dateA > dateB) return 1;
      return a.employeeName.localeCompare(b.employeeName);
  });

  for (const emp of employeesForService) {
    const state = employeeStates[emp.id];
    if (!state) continue;

    let currentConsecutiveWork = 0;
    let currentConsecutiveRest = 0;
    let lastTypeEncountered: EmployeeState['lastShiftType'] = undefined;

    for (let i = lookbackDays; i >= 1; i--) {
        const dateToCheck = subDays(firstDayOfCurrentMonth, i);
        const dateToCheckStr = format(dateToCheck, 'yyyy-MM-dd');
        const shiftsForEmpOnDate = sortedPreviousShifts.filter(
            s => s.date === dateToCheckStr && s.employeeName === emp.name
        );
        const shiftToday: AIShift | undefined = shiftsForEmpOnDate[0];

        if (shiftToday) {
            if (shiftToday.startTime && shiftToday.endTime) { // M, T, N
                currentConsecutiveWork = (lastTypeEncountered === 'M' || lastTypeEncountered === 'T' || lastTypeEncountered === 'N') ? currentConsecutiveWork + 1 : 1;
                currentConsecutiveRest = 0;
                const note = shiftToday.notes || '';
                if (note.includes('(M)')) lastTypeEncountered = 'M';
                else if (note.includes('(T)')) lastTypeEncountered = 'T';
                else if (note.includes('(N)')) lastTypeEncountered = 'N';
                else lastTypeEncountered = 'M';
            } else if (shiftToday.notes?.includes('D') || shiftToday.notes?.includes('LAO') || shiftToday.notes?.includes('LM') || shiftToday.notes?.includes('C')) {
                currentConsecutiveRest = (lastTypeEncountered === 'D' || lastTypeEncountered === 'LAO' || lastTypeEncountered === 'LM' || lastTypeEncountered === 'C' || lastTypeEncountered === undefined) ? currentConsecutiveRest + 1 : 1;
                currentConsecutiveWork = 0;
                if (shiftToday.notes?.includes('LAO')) lastTypeEncountered = 'LAO';
                else if (shiftToday.notes?.includes('LM')) lastTypeEncountered = 'LM';
                else if (shiftToday.notes?.includes('C')) lastTypeEncountered = 'C';
                else lastTypeEncountered = 'D';
            }
        } else {
            currentConsecutiveRest = (lastTypeEncountered === 'D' || lastTypeEncountered === 'LAO' || lastTypeEncountered === 'LM' || lastTypeEncountered === 'C' || lastTypeEncountered === undefined) ? currentConsecutiveRest + 1 : 1;
            currentConsecutiveWork = 0;
            lastTypeEncountered = 'D';
        }
    }
    state.consecutiveWorkDays = currentConsecutiveWork;
    state.consecutiveRestDays = currentConsecutiveRest;
    state.lastShiftType = lastTypeEncountered;
  }


  for (let day = 1; day <= daysInMonthCount; day++) {
    const currentDate = new Date(yearInt, monthInt - 1, day);
    const currentDateStrYYYYMMDD = format(currentDate, 'yyyy-MM-dd');
    const currentDayOfWeekNum = getDay(currentDate);
    const currentDayOfWeekName = format(currentDate, 'eeee', { locale: es }).toLowerCase();
    const isWeekend = currentDayOfWeekNum === 0 || currentDayOfWeekNum === 6;
    const isHolidayDay = holidays.some(h => h.date === currentDateStrYYYYMMDD);
    const useWeekendHolidayStaffing = isWeekend || isHolidayDay;

    let staffingNeeds = {
      morning: useWeekendHolidayStaffing ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
      afternoon: useWeekendHolidayStaffing ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
      night: (service.enableNightShift && useWeekendHolidayStaffing) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
    };

    const dailyAssignedWorkShifts = new Set<string>();
    const dailyProcessedEmployees = new Set<string>();

    employeesForService.forEach(emp => {
      if (dailyProcessedEmployees.has(emp.id)) return;
      const state = employeeStates[emp.id];
      const fixedAssignment = isEmployeeOnFixedAssignmentOnDate(emp, currentDate);
      if (fixedAssignment && (fixedAssignment.type === 'LAO' || fixedAssignment.type === 'LM')) {
        generatedShifts.push({
            date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name,
            startTime: '', endTime: '', notes: fixedAssignment.type + (fixedAssignment.description ? ` - ${fixedAssignment.description}` : ''),
        });
        dailyProcessedEmployees.add(emp.id);
        state.consecutiveRestDays = (state.lastShiftType === 'LAO' || state.lastShiftType === 'LM') ? state.consecutiveRestDays + 1 : 1;
        state.consecutiveWorkDays = 0;
        state.lastShiftType = fixedAssignment.type;
      }
    });

    employeesForService.forEach(emp => {
        if (dailyProcessedEmployees.has(emp.id)) return;
        const state = employeeStates[emp.id];
        const preferences = emp.preferences;

        if (preferences?.fixedWeeklyShiftDays && preferences.fixedWeeklyShiftDays.includes(currentDayOfWeekName)) {
            const fixedTiming = preferences.fixedWeeklyShiftTiming;
            if (fixedTiming && fixedTiming !== NO_FIXED_TIMING_VALUE) {
                if (fixedTiming === REST_DAY_VALUE || fixedTiming.toUpperCase() === 'D') {
                    if (dailyAssignedWorkShifts.has(emp.id)) { // Check if already assigned a work shift this day
                        violations.push({
                            employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General',
                            rule: "Conflicto Turno Fijo vs Asignación", details: `Descanso fijo semanal (${currentDayOfWeekName}) en conflicto con turno de trabajo ya asignado. Se priorizó el turno de trabajo.`,
                            severity: 'warning'
                        });
                        score -= 2;
                    } else {
                        generatedShifts.push({
                            date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name,
                            startTime: '', endTime: '', notes: 'D (Fijo Semanal)',
                        });
                        dailyProcessedEmployees.add(emp.id);
                        state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === 'C' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                        state.consecutiveWorkDays = 0;
                        state.lastShiftType = 'D';
                    }
                } else if (['mañana', 'tarde', 'noche'].includes(fixedTiming.toLowerCase())) {
                    const shiftCode = fixedTiming.toLowerCase().charAt(0).toUpperCase() as 'M' | 'T' | 'N';
                    if (shiftCode === 'N' && !service.enableNightShift) return;

                    let neededStaffCount = 0;
                    if (shiftCode === 'M') neededStaffCount = staffingNeeds.morning;
                    else if (shiftCode === 'T') neededStaffCount = staffingNeeds.afternoon;
                    else if (shiftCode === 'N') neededStaffCount = staffingNeeds.night;

                    const maxWorkDays = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
                    const canWorkFixed = state.consecutiveWorkDays < maxWorkDays &&
                                       (state.lastShiftType === 'D' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.consecutiveRestDays >= (service.consecutivenessRules?.minConsecutiveDaysOffRequiredBeforeWork || 1) || state.lastShiftType === undefined || (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N'));


                    if (neededStaffCount > 0 && canWorkFixed) {
                        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftCode);
                        generatedShifts.push({
                            date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name,
                            startTime, endTime, notes: `Turno Fijo ${notesSuffix}`,
                        });
                        dailyAssignedWorkShifts.add(emp.id);
                        dailyProcessedEmployees.add(emp.id);
                        state.shiftsThisMonth++;
                        state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                        state.consecutiveRestDays = 0;
                        state.lastShiftType = shiftCode;

                        if (shiftCode === 'M') staffingNeeds.morning--;
                        else if (shiftCode === 'T') staffingNeeds.afternoon--;
                        else if (shiftCode === 'N') staffingNeeds.night--;
                    } else if (!canWorkFixed) {
                        violations.push({
                            employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode,
                            rule: "Turno Fijo Semanal Ignorado (Regla Consecutividad)", details: `No se asignó turno fijo ${shiftCode} por exceder máx. días trabajo o descanso insuficiente.`,
                            severity: 'warning'
                        });
                        score -= 3;
                    } else if (neededStaffCount <= 0) {
                        violations.push({
                            employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode,
                            rule: "Turno Fijo Semanal Ignorado (Dotación Cubierta)", details: `No se asignó turno fijo ${shiftCode} porque la dotación ya estaba cubierta.`,
                            severity: 'warning'
                        });
                        score -= 1;
                    }
                }
            }
        }
    });

    const assignShiftsForType = (
        shiftType: 'M' | 'T' | 'N',
        getNeeded: () => number,
        decrementNeeded: () => void,
        notesDetail: string
      ) => {
        let needed = getNeeded();
        if (needed <= 0) return;

        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftType);
        const maxWorkDays = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
        const preferredRestDays = service.consecutivenessRules?.preferredConsecutiveDaysOff || 1;
        const minRestDaysRequired = service.consecutivenessRules?.minConsecutiveDaysOffRequiredBeforeWork || 1;


        const availableForWork = employeesForService
            .filter(emp => !dailyProcessedEmployees.has(emp.id) && !dailyAssignedWorkShifts.has(emp.id))
            .filter(emp => {
                const state = employeeStates[emp.id];
                const wasResting = state.lastShiftType === 'D' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
                const hasEnoughRest = wasResting ? state.consecutiveRestDays >= minRestDaysRequired : true;
                
                if (state.consecutiveWorkDays >= maxWorkDays) return false; // Hard rule
                return hasEnoughRest;
            })
            .sort((a, b) => {
                const stateA = employeeStates[a.id];
                const stateB = employeeStates[b.id];
                if (stateA.shiftsThisMonth !== stateB.shiftsThisMonth) return stateA.shiftsThisMonth - stateB.shiftsThisMonth;
                if (useWeekendHolidayStaffing) {
                    const prefersA = a.preferences?.prefersWeekendWork ?? false;
                    const prefersB = b.preferences?.prefersWeekendWork ?? false;
                    if (prefersA && !prefersB) return -1;
                    if (!prefersA && prefersB) return 1;
                }
                if (stateA.consecutiveRestDays !== stateB.consecutiveRestDays) return stateB.consecutiveRestDays - stateA.consecutiveRestDays; // Prefer those who rested more
                return Math.random() - 0.5; // Randomize if equal
            });

        for (const emp of availableForWork) {
          if (needed <= 0) break;
          const state = employeeStates[emp.id];

          // Check preferred rest days before starting work
          const wasResting = state.lastShiftType === 'D' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
          if (wasResting && state.consecutiveRestDays < preferredRestDays && service.consecutivenessRules?.preferredConsecutiveDaysOff) {
                violations.push({
                    employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftType,
                    rule: "Descanso Preferido No Cumplido", details: `Inicia trabajo con ${state.consecutiveRestDays} días de descanso (preferido: ${preferredRestDays}).`,
                    severity: 'warning'
                });
                score -= 2;
          }

          generatedShifts.push({
            date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name,
            startTime: startTime, endTime: endTime, notes: `${notesDetail} ${notesSuffix}`,
          });
          dailyAssignedWorkShifts.add(emp.id);
          dailyProcessedEmployees.add(emp.id);
          state.shiftsThisMonth++;
          state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
          state.consecutiveRestDays = 0;
          state.lastShiftType = shiftType;
          decrementNeeded();
          needed = getNeeded();
        }
      };

    assignShiftsForType('M', () => staffingNeeds.morning, () => staffingNeeds.morning--, "Turno Mañana");
    assignShiftsForType('T', () => staffingNeeds.afternoon, () => staffingNeeds.afternoon--, "Turno Tarde");
    if (service.enableNightShift) {
      assignShiftsForType('N', () => staffingNeeds.night, () => staffingNeeds.night--, "Turno Noche");
    }

    // Registrar falta de personal
    if (staffingNeeds.morning > 0) {
        violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'M', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.morning} empleado(s) para el Turno Mañana.`, severity: 'error' });
        score -= staffingNeeds.morning * 5;
    }
    if (staffingNeeds.afternoon > 0) {
        violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'T', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.afternoon} empleado(s) para el Turno Tarde.`, severity: 'error' });
        score -= staffingNeeds.afternoon * 5;
    }
    if (service.enableNightShift && staffingNeeds.night > 0) {
        violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'N', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.night} empleado(s) para el Turno Noche.`, severity: 'error' });
        score -= staffingNeeds.night * 5;
    }


    employeesForService.forEach(emp => {
        const state = employeeStates[emp.id];
        if (!dailyProcessedEmployees.has(emp.id)) {
             // Check for max consecutive work days violation *before* assigning rest
            const maxWorkDays = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
            if (state.consecutiveWorkDays >= maxWorkDays && (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N')) {
                // This means the employee worked up to max days and *must* rest now.
                // If this employee was *not* assigned a fixed rest day, this is expected.
            }

            generatedShifts.push({
                date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name,
                startTime: '', endTime: '', notes: 'D (Descanso)',
            });
            dailyProcessedEmployees.add(emp.id);
            state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === 'C' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
            state.consecutiveWorkDays = 0;
            state.lastShiftType = 'D';
        } else if (dailyAssignedWorkShifts.has(emp.id)) { // Employee worked today
            const maxWorkDays = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
             if (state.consecutiveWorkDays > maxWorkDays) { // Should ideally be caught before assignment, this is a fallback check
                violations.push({
                    employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General',
                    rule: "Exceso Días Trabajo Consecutivos", details: `Trabajó ${state.consecutiveWorkDays} días (máx: ${maxWorkDays}).`,
                    severity: 'error'
                });
                score -= 10;
            }
        }
    });
  }

  const monthName = format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es });
  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;

  let responseSummary = `Horario generado para ${service.name} (${monthName}). Puntuación: ${Math.max(0, score)}/100.`;
  if (errorCount > 0) responseSummary += ` Errores: ${errorCount}.`;
  if (warningCount > 0) responseSummary += ` Advertencias: ${warningCount}.`;


  return {
    generatedShifts,
    responseText: responseSummary,
    violations,
    score: Math.max(0, score), // Ensure score doesn't go below 0
  };
}
