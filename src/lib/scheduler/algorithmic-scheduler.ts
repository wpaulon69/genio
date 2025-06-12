
'use server';

import type { Service, Employee, FixedAssignment, Holiday, ScheduleViolation, AIShift, WorkPattern, ScoreBreakdown } from '@/lib/types';
import { format, getDaysInMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getDay, subDays, isValid, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { SHIFT_OPTIONS } from '@/lib/constants/schedule-constants';

/**
 * @fileOverview Algoritmo para la generación automática y evaluación de horarios de turnos.
 * Este módulo contiene:
 * - La lógica principal para crear un horario mensual para un servicio (`generateAlgorithmicSchedule`).
 * - Una función completa para evaluar un conjunto de turnos existentes (`evaluateScheduleMetrics`).
 * Considera las reglas del servicio, las preferencias y asignaciones fijas de los empleados,
 * los feriados y la continuidad con el horario del mes anterior.
 * Intenta optimizar la cobertura de turnos y el bienestar del personal,
 * generando una puntuación y una lista de violaciones.
 */

/**
 * @interface AlgorithmicScheduleOutput
 * Define la estructura de salida de la función `generateAlgorithmicSchedule`.
 */
interface AlgorithmicScheduleOutput {
  /** Array de turnos generados por el algoritmo. */
  generatedShifts: AIShift[];
  /** Un resumen textual del proceso de generación y el resultado. */
  responseText: string;
  /** Lista de violaciones a las reglas o preferencias detectadas. */
  violations: ScheduleViolation[];
  /** Puntuación general del horario (0-100). */
  score: number;
  /** Desglose de la puntuación en categorías (reglas del servicio, bienestar del personal). */
  scoreBreakdown: ScoreBreakdown;
}

/**
 * @interface EmployeeState
 * Mantiene el estado de un empleado durante el proceso de generación o evaluación del horario.
 * Se utiliza para rastrear la consecutividad de turnos, descansos, y otras métricas relevantes.
 */
interface EmployeeState {
  /** ID del empleado. */
  id: string;
  /** Nombre del empleado. */
  name: string;
  /** Número de días de trabajo consecutivos hasta la fecha actual. */
  consecutiveWorkDays: number;
  /** Número de días de descanso consecutivos hasta la fecha actual. */
  consecutiveRestDays: number;
  /** Número total de turnos de trabajo asignados a este empleado en el mes actual. */
  shiftsThisMonth: number;
  /**
   * Tipo del último turno o asignación del empleado (ej. 'M', 'D', 'LAO').
   * Se utiliza para determinar la consecutividad.
   */
  lastShiftType?: AIShift['notes'] | 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F';
  /**
   * Fecha y hora de finalización del último turno de TRABAJO real (M, T, o N).
   * Importante para calcular la regla de descanso mínimo entre turnos.
   */
  lastActualWorkShiftEndTime: Date | null;
  /** Número de fines de semana completos (Sábado + Domingo de descanso) que el empleado ha tenido en el mes actual. */
  completeWeekendsOffThisMonth: number;
}

/**
 * @interface EvaluationContext
 * Contiene los resultados acumulados durante la evaluación de un horario.
 */
interface EvaluationContext {
  /** Puntuación actual del horario (inicia en 100). */
  score: number;
  /** Desglose de la puntuación actual. */
  scoreBreakdown: ScoreBreakdown;
  /** Array de violaciones detectadas. */
  violations: ScheduleViolation[];
}

/** Valor constante para indicar que no hay un horario fijo seleccionado en las preferencias del empleado. */
const NO_FIXED_TIMING_VALUE = "none_selected";
/** Valor constante para indicar un día de descanso en las preferencias de turno fijo del empleado. */
const REST_DAY_VALUE = "rest_day";

/**
 * Verifica si una fecha dada se encuentra dentro de un rango de fechas (inclusivo).
 * Si `endDate` no se proporciona, verifica si `date` es el mismo día que `startDate`.
 * @param {Date} date - La fecha a verificar.
 * @param {Date} startDate - La fecha de inicio del rango.
 * @param {Date} [endDate] - La fecha de fin opcional del rango.
 * @returns {boolean} True si `date` está dentro del rango, false en caso contrario.
 */
const isDateInRange = (date: Date, startDate: Date, endDate?: Date): boolean => {
  if (endDate) {
    return isWithinInterval(date, { start: startOfDay(startDate), end: endOfDay(endDate) });
  }
  return format(startOfDay(date), 'yyyy-MM-dd') === format(startOfDay(startDate), 'yyyy-MM-dd');
};

/**
 * Verifica si un empleado tiene una asignación fija (descanso, licencia) en una fecha específica.
 * @param {Employee} employee - El objeto del empleado.
 * @param {Date} targetDate - La fecha para la cual se verifica la asignación.
 * @returns {FixedAssignment | null} La asignación fija si existe para esa fecha, o `null`.
 */
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

/**
 * Obtiene los detalles (hora de inicio, fin y sufijo para notas) de un tipo de turno de trabajo (M, T, N).
 * @param {'M' | 'T' | 'N'} shiftCode - El código del turno.
 * @returns {{ startTime: string; endTime: string; notesSuffix: string }} Los detalles del turno.
 */
const getShiftDetails = (shiftCode: 'M' | 'T' | 'N'): { startTime: string; endTime: string; notesSuffix: string } => {
    const option = SHIFT_OPTIONS.find(opt => opt.value === shiftCode);
    return { startTime: option?.startTime || '', endTime: option?.endTime || '', notesSuffix: `(${shiftCode})` };
}

/**
 * Crea un objeto `Date` a partir de una fecha base y una cadena de tiempo (HH:MM).
 * Maneja el caso de turnos nocturnos donde la hora de finalización puede caer en el día siguiente.
 * @param {Date} baseDate - La fecha base para el turno.
 * @param {string} timeString - La hora en formato "HH:MM".
 * @param {boolean} [isNightShiftEndTime=false] - Indica si `timeString` es la hora de finalización de un turno nocturno.
 * @returns {Date} El objeto Date resultante.
 */
function getShiftDateTime(baseDate: Date, timeString: string, isNightShiftEndTime: boolean = false): Date {
  if (!timeString) return new Date(baseDate); // Si no hay timeString, devuelve la baseDate (para D, F, etc.)
  const [hours, minutes] = timeString.split(':').map(Number);
  const shiftDate = new Date(baseDate);
  shiftDate.setHours(hours, minutes, 0, 0);

  if (isNightShiftEndTime && hours < 12) {
    shiftDate.setDate(baseDate.getDate() + 1);
  }
  return shiftDate;
}

/**
 * Verifica si asignar un turno de trabajo específico a un empleado respeta la regla de descanso mínimo (ej. 12 horas).
 * @param {EmployeeState} employeeState - El estado actual del empleado.
 * @param {'M' | 'T' | 'N'} shiftCodeToAssign - El código del turno que se intenta asignar.
 * @param {Date} currentDate - La fecha para la cual se está asignando el turno.
 * @returns {boolean} True si se puede asignar el turno respetando el descanso, false en caso contrario.
 */
function canAssignShiftDueToRest(
  employeeState: EmployeeState,
  shiftCodeToAssign: 'M' | 'T' | 'N',
  currentDate: Date
): boolean {
  if (!employeeState.lastActualWorkShiftEndTime) {
    return true;
  }
  const { startTime: currentShiftStartTimeStr } = getShiftDetails(shiftCodeToAssign);
  const currentShiftStartTime = getShiftDateTime(currentDate, currentShiftStartTimeStr, false);
  const hoursDifference = (currentShiftStartTime.getTime() - employeeState.lastActualWorkShiftEndTime.getTime()) / (1000 * 60 * 60);
  return hoursDifference >= 12; // Asume una regla de 12 horas de descanso.
}

/**
 * Normaliza un nombre de día de la semana (ej. "Miércoles" a "miercoles").
 * @param {string} dayName - El nombre del día a normalizar.
 * @returns {string} El nombre del día normalizado.
 */
const normalizeDayName = (dayName: string): string => {
  if (!dayName) return '';
  return dayName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

/**
 * Obtiene el tipo de turno ('M', 'T', 'N', 'D', etc.) a partir de un objeto AIShift.
 * @param {AIShift} shift - El turno a evaluar.
 * @returns {'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F' | null} El tipo de turno, o null si no se puede determinar.
 */
const getShiftTypeForEval = (shift: AIShift): 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F' | null => {
    const note = shift.notes?.toUpperCase();
    if (!note) {
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
    if (note.includes('D (FIJO SEMANAL)') || note.includes('D (DESCANSO)') || note.includes('D (FDS OBJETIVO)')) return 'D';
    if (note.startsWith('LAO')) return 'LAO';
    if (note.startsWith('LM')) return 'LM';
    if (note.includes('C (FRANCO COMP.)') || note.includes('C (COMPENSATORIO)')) return 'C';
    if (note.includes('F (FERIADO') || note.includes('F (FDS OBJETIVO - FERIADO)')) return 'F';
    return null;
};

/**
 * Evalúa el cumplimiento del objetivo de fines de semana completos de descanso para los empleados.
 * Modifica el contexto de evaluación (`evalCtx`) añadiendo violaciones y penalizaciones.
 * @param {AIShift[]} shiftsToEvaluate - Los turnos a evaluar.
 * @param {Service} service - El servicio para el cual se generó el horario.
 * @param {string} monthStr - El mes del horario (1-12).
 * @param {string} yearStr - El año del horario.
 * @param {Employee[]} employeesForService - Lista de empleados asignados al servicio.
 * @param {EvaluationContext} evalCtx - El contexto de evaluación actual (score, violations, breakdown) que será modificado.
 */
function evaluateWeekendTargetCompliance(
    shiftsToEvaluate: AIShift[],
    service: Service,
    monthStr: string,
    yearStr: string,
    employeesForService: Employee[],
    evalCtx: EvaluationContext
): void {
    if (!service.targetCompleteWeekendsOff || service.targetCompleteWeekendsOff <= 0) {
        return;
    }

    const monthInt = parseInt(monthStr, 10);
    const yearInt = parseInt(yearStr, 10);
    const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));

    employeesForService.forEach(emp => {
        let completeWeekendsOffCount = 0;
        for (let dayIter = 1; dayIter <= daysInMonthCount; dayIter++) {
            const date = new Date(yearInt, monthInt - 1, dayIter);
            if (getDay(date) === 6) { // Es Sábado.
                const saturdayStr = format(date, 'yyyy-MM-dd');
                const sundayStr = format(addDays(date, 1), 'yyyy-MM-dd');

                if (addDays(date, 1).getMonth() === monthInt - 1) { // Domingo dentro del mismo mes.
                    const saturdayShift = shiftsToEvaluate.find(s => s.employeeName === emp.name && s.date === saturdayStr);
                    const sundayShift = shiftsToEvaluate.find(s => s.employeeName === emp.name && s.date === sundayStr);

                    if (saturdayShift && sundayShift) {
                        const satShiftType = getShiftTypeForEval(saturdayShift);
                        const sunShiftType = getShiftTypeForEval(sundayShift);
                        const isSatOff = satShiftType === 'D' || satShiftType === 'F' || satShiftType === 'LAO' || satShiftType === 'LM' || satShiftType === 'C';
                        const isSunOff = sunShiftType === 'D' || sunShiftType === 'F' || sunShiftType === 'LAO' || sunShiftType === 'LM' || sunShiftType === 'C';

                        if (isSatOff && isSunOff) {
                            completeWeekendsOffCount++;
                        }
                    } else if (!saturdayShift && !sundayShift) { // Si no hay turnos (implica descanso)
                        completeWeekendsOffCount++;
                    }
                }
            }
        }

        if (completeWeekendsOffCount < service.targetCompleteWeekendsOff) {
            evalCtx.violations.push({
                employeeName: emp.name,
                rule: "Objetivo FDS Descanso No Alcanzado",
                details: `${emp.name} tuvo ${completeWeekendsOffCount} FDS de descanso completo (Objetivo: ${service.targetCompleteWeekendsOff}).`,
                severity: 'warning',
                category: 'employeeWellbeing',
                shiftType: 'General',
                date: `${yearStr}-${String(monthInt).padStart(2, '0')}`
            });
            evalCtx.score -= 1; // Penalización leve.
            evalCtx.scoreBreakdown.employeeWellbeing -= 1;
        }
    });
}


/**
 * Evalúa un conjunto completo de turnos para un servicio, mes y año dados,
 * calculando una puntuación, una lista de violaciones y un desglose de la puntuación.
 * @param {AIShift[]} shiftsToEvaluate - El array de turnos a evaluar.
 * @param {Service} service - El objeto del servicio.
 * @param {string} monthStr - El mes del horario (1-12).
 * @param {string} yearStr - El año del horario.
 * @param {Employee[]} allEmployees - Lista de todos los empleados (se filtrarán los del servicio).
 * @param {Holiday[]} allHolidays - Lista de todos los feriados.
 * @param {AIShift[] | null} previousMonthShifts - Turnos del mes anterior para continuidad.
 * @returns {Promise<AlgorithmicScheduleOutput>} Un objeto con la puntuación, violaciones, desglose y un texto resumen.
 */
export async function evaluateScheduleMetrics(
  shiftsToEvaluate: AIShift[],
  service: Service,
  monthStr: string,
  yearStr: string,
  allEmployees: Employee[],
  allHolidays: Holiday[],
  previousMonthShifts: AIShift[] | null
): Promise<AlgorithmicScheduleOutput> {
    const evalCtx: EvaluationContext = {
        score: 100,
        scoreBreakdown: { serviceRules: 100, employeeWellbeing: 100 },
        violations: [],
    };

    const monthInt = parseInt(monthStr, 10);
    const yearInt = parseInt(yearStr, 10);
    const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));
    const firstDayOfCurrentMonth = new Date(yearInt, monthInt - 1, 1);

    const employeesForService = allEmployees.filter(emp => emp.serviceIds.includes(service.id));
    if (employeesForService.length === 0) {
        evalCtx.violations.push({ rule: "Sin Empleados", details: `No hay empleados asignados al servicio ${service.name}`, severity: 'error', date: format(firstDayOfCurrentMonth, 'yyyy-MM-dd'), shiftType:'General', category: 'serviceRule' });
        evalCtx.score = 0; evalCtx.scoreBreakdown.serviceRules = 0;
        return { generatedShifts: shiftsToEvaluate, responseText: "Error: Sin empleados en el servicio.", ...evalCtx };
    }

    const employeeStates: Record<string, EmployeeState> = {};
    employeesForService.forEach(emp => {
        employeeStates[emp.id] = { id: emp.id, name: emp.name, consecutiveWorkDays: 0, consecutiveRestDays: 0, shiftsThisMonth: 0, lastShiftType: undefined, lastActualWorkShiftEndTime: null, completeWeekendsOffThisMonth: 0 };
    });

    const lookbackDays = Math.max(service.consecutivenessRules?.maxConsecutiveWorkDays || 7, service.consecutivenessRules?.maxConsecutiveDaysOff || 7, 7);
    const sortedPreviousShifts = (previousMonthShifts || []).sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

    for (const emp of employeesForService) {
        const state = employeeStates[emp.id];
        let currentConsecutiveWork = 0; let currentConsecutiveRest = 0;
        let lastTypeEncountered: EmployeeState['lastShiftType'] = undefined;
        let lastWorkShiftEnd: Date | null = null;

        for (let i = lookbackDays; i >= 1; i--) {
            const dateToCheck = subDays(firstDayOfCurrentMonth, i);
            const dateToCheckStr = format(dateToCheck, 'yyyy-MM-dd');
            const shiftToday = sortedPreviousShifts.find(s => s.date === dateToCheckStr && s.employeeName === emp.name);

            if (shiftToday) {
                const shiftType = getShiftTypeForEval(shiftToday);
                if (shiftType === 'M' || shiftType === 'T' || shiftType === 'N') {
                    currentConsecutiveWork = (lastTypeEncountered === 'M' || lastTypeEncountered === 'T' || lastTypeEncountered === 'N') ? currentConsecutiveWork + 1 : 1;
                    currentConsecutiveRest = 0;
                    lastTypeEncountered = shiftType;
                    const { endTime: shiftEndTimeStr } = getShiftDetails(shiftType);
                    lastWorkShiftEnd = getShiftDateTime(dateToCheck, shiftEndTimeStr, shiftType === 'N');
                } else if (shiftType === 'D' || shiftType === 'F' || shiftType === 'LAO' || shiftType === 'LM' || shiftType === 'C') {
                    currentConsecutiveRest = (lastTypeEncountered === 'D' || lastTypeEncountered === 'F' || lastTypeEncountered === 'LAO' || lastTypeEncountered === 'LM' || lastTypeEncountered === 'C' || lastTypeEncountered === undefined) ? currentConsecutiveRest + 1 : 1;
                    currentConsecutiveWork = 0;
                    lastTypeEncountered = shiftType;
                }
            } else { // No shift implies rest
                currentConsecutiveRest = (lastTypeEncountered === 'D' || lastTypeEncountered === 'F' || lastTypeEncountered === 'LAO' || lastTypeEncountered === 'LM' || lastTypeEncountered === 'C' || lastTypeEncountered === undefined) ? currentConsecutiveRest + 1 : 1;
                currentConsecutiveWork = 0; lastTypeEncountered = 'D';
            }
        }
        state.consecutiveWorkDays = currentConsecutiveWork;
        state.consecutiveRestDays = currentConsecutiveRest;
        state.lastShiftType = lastTypeEncountered;
        state.lastActualWorkShiftEndTime = lastWorkShiftEnd;
    }

    // Loop through each day of the month to evaluate shifts
    for (let day = 1; day <= daysInMonthCount; day++) {
        const currentDate = new Date(yearInt, monthInt - 1, day);
        const currentDateStrYYYYMMDD = format(currentDate, 'yyyy-MM-dd');
        const isWeekendDay = getDay(currentDate) === 0 || getDay(currentDate) === 6;
        const isHolidayDay = allHolidays.some(h => h.date === currentDateStrYYYYMMDD);
        const useWeekendHolidayStaffing = isWeekendDay || isHolidayDay;

        const dailyStaffing = { M: 0, T: 0, N: 0 };

        for (const emp of employeesForService) {
            const state = employeeStates[emp.id];
            const shiftForEmployeeToday = shiftsToEvaluate.find(s => s.employeeName === emp.name && s.date === currentDateStrYYYYMMDD);
            const shiftType = shiftForEmployeeToday ? getShiftTypeForEval(shiftForEmployeeToday) : null;

            if (shiftType === 'M' || shiftType === 'T' || shiftType === 'N') {
                state.shiftsThisMonth++;
                dailyStaffing[shiftType]++;

                if (!canAssignShiftDueToRest(state, shiftType, currentDate)) {
                    evalCtx.violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType, rule: "Violación Descanso Mínimo entre Turnos", details: `No se respetaron las 12h de descanso. Último turno laboral terminó ${state.lastActualWorkShiftEndTime ? format(state.lastActualWorkShiftEndTime, 'Pp', {locale:es}) : 'N/A'}.`, severity: 'error', category: 'employeeWellbeing' });
                    evalCtx.score -= 10; evalCtx.scoreBreakdown.employeeWellbeing -= 10;
                }

                const wasResting = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
                if (wasResting && state.consecutiveRestDays < (service.consecutivenessRules?.minConsecutiveDaysOffRequiredBeforeWork || 1)) {
                    evalCtx.violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType, rule: "Violación Mínimo Descanso Antes de Trabajar", details: `Comienza trabajo con ${state.consecutiveRestDays} día(s) de descanso (requerido: ${service.consecutivenessRules?.minConsecutiveDaysOffRequiredBeforeWork || 1}).`, severity: 'error', category: 'serviceRule' });
                    evalCtx.score -= 5; evalCtx.scoreBreakdown.serviceRules -= 5;
                }

                state.consecutiveWorkDays = wasResting ? 1 : state.consecutiveWorkDays + 1;
                state.consecutiveRestDays = 0;
                state.lastShiftType = shiftType;
                const { endTime: shiftEndTimeStr } = getShiftDetails(shiftType);
                state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, shiftEndTimeStr, shiftType === 'N');

                if (state.consecutiveWorkDays > (service.consecutivenessRules?.maxConsecutiveWorkDays || 7)) {
                    evalCtx.violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType, rule: "Exceso Días Trabajo Consecutivos", details: `Trabajó ${state.consecutiveWorkDays} días (máx: ${service.consecutivenessRules?.maxConsecutiveWorkDays || 7}).`, severity: 'error', category: 'serviceRule' });
                    evalCtx.score -= 5; evalCtx.scoreBreakdown.serviceRules -= 5;
                }

            } else { // Employee is resting or on leave
                state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined || !state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
                state.consecutiveWorkDays = 0;
                state.lastShiftType = shiftType || 'D'; // Default to 'D' if no shift (empty cell)

                if (state.consecutiveRestDays > (service.consecutivenessRules?.maxConsecutiveDaysOff || 7)) {
                    evalCtx.violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General', rule: "Exceso Días Descanso Consecutivos", details: `Descansó ${state.consecutiveRestDays} días (máx: ${service.consecutivenessRules?.maxConsecutiveDaysOff || 7}).`, severity: 'warning', category: 'employeeWellbeing' });
                    evalCtx.score -= 1; evalCtx.scoreBreakdown.employeeWellbeing -= 1;
                }
            }
        }

        // Check staffing needs for the day
        const staffingNeeds = {
            morning: useWeekendHolidayStaffing ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
            afternoon: useWeekendHolidayStaffing ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
            night: (service.enableNightShift && useWeekendHolidayStaffing) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
        };

        if (dailyStaffing.M < staffingNeeds.morning) {
            evalCtx.violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'M', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.morning - dailyStaffing.M} empleado(s) para Mañana.`, severity: 'error', category: 'serviceRule' });
            evalCtx.score -= (staffingNeeds.morning - dailyStaffing.M) * 5; evalCtx.scoreBreakdown.serviceRules -= (staffingNeeds.morning - dailyStaffing.M) * 5;
        }
        if (dailyStaffing.T < staffingNeeds.afternoon) {
            evalCtx.violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'T', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.afternoon - dailyStaffing.T} empleado(s) para Tarde.`, severity: 'error', category: 'serviceRule' });
            evalCtx.score -= (staffingNeeds.afternoon - dailyStaffing.T) * 5; evalCtx.scoreBreakdown.serviceRules -= (staffingNeeds.afternoon - dailyStaffing.T) * 5;
        }
        if (service.enableNightShift && dailyStaffing.N < staffingNeeds.night) {
            evalCtx.violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'N', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.night - dailyStaffing.N} empleado(s) para Noche.`, severity: 'error', category: 'serviceRule' });
            evalCtx.score -= (staffingNeeds.night - dailyStaffing.N) * 5; evalCtx.scoreBreakdown.serviceRules -= (staffingNeeds.night - dailyStaffing.N) * 5;
        }
    }

    evaluateWeekendTargetCompliance(shiftsToEvaluate, service, monthStr, yearStr, employeesForService, evalCtx);

    const finalScore = Math.max(0, Math.min(100, evalCtx.score));
    evalCtx.scoreBreakdown.serviceRules = Math.max(0, Math.min(100, evalCtx.scoreBreakdown.serviceRules));
    evalCtx.scoreBreakdown.employeeWellbeing = Math.max(0, Math.min(100, evalCtx.scoreBreakdown.employeeWellbeing));

    const monthName = format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es });
    const errorCount = evalCtx.violations.filter(v => v.severity === 'error').length;
    const warningCount = evalCtx.violations.filter(v => v.severity === 'warning').length;
    let responseSummary = `Evaluación del horario para ${service.name} (${monthName}). Puntuación General: ${finalScore.toFixed(0)}/100.`;
    responseSummary += ` [Reglas Servicio: ${evalCtx.scoreBreakdown.serviceRules.toFixed(0)}/100, Bienestar Personal: ${evalCtx.scoreBreakdown.employeeWellbeing.toFixed(0)}/100].`;
    if (errorCount > 0) responseSummary += ` Errores Críticos: ${errorCount}.`;
    if (warningCount > 0) responseSummary += ` Advertencias: ${warningCount}.`;
    if (errorCount === 0 && warningCount === 0) responseSummary += " ¡Sin errores ni advertencias notables!";

    return {
        generatedShifts: shiftsToEvaluate, // Return the input shifts as part of the output structure
        responseText: responseSummary,
        violations: evalCtx.violations,
        score: finalScore,
        scoreBreakdown: evalCtx.scoreBreakdown,
    };
}


/**
 * Genera un horario de turnos algorítmicamente para un servicio, mes y año dados.
 *
 * @async
 * @param {Service} service - El objeto del servicio para el cual generar el horario.
 * @param {string} month - El mes para el cual generar el horario (1-12).
 * @param {string} year - El año para el cual generar el horario.
 * @param {Employee[]} allEmployees - Lista de todos los empleados disponibles en el sistema.
 * @param {Holiday[]} holidays - Lista de feriados.
 * @param {AIShift[] | null} previousMonthShifts - Lista de turnos del mes anterior para calcular continuidad.
 * @returns {Promise<AlgorithmicScheduleOutput>} Una promesa que se resuelve con el horario generado,
 *          el texto de respuesta, las violaciones, la puntuación y el desglose de la puntuación.
 */
export async function generateAlgorithmicSchedule(
  service: Service,
  month: string,
  year: string,
  allEmployees: Employee[],
  holidays: Holiday[],
  previousMonthShifts: AIShift[] | null
): Promise<AlgorithmicScheduleOutput> {
  const generatedShiftsOutput: AIShift[] = [];
  // Las violaciones, score y scoreBreakdown ahora se calcularán principalmente por evaluateScheduleMetrics.
  // Se podrían mantener algunas violaciones directas de generación si son muy específicas del proceso de llenado.

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
      responseText: `No hay empleados asignados al servicio ${service.name}. No se pudo generar el horario.`
    };
  }

  const employeeStates: Record<string, EmployeeState> = {};
  employeesForService.forEach(emp => {
    employeeStates[emp.id] = { id: emp.id, name: emp.name, consecutiveWorkDays: 0, consecutiveRestDays: 0, shiftsThisMonth: 0, lastShiftType: undefined, lastActualWorkShiftEndTime: null, completeWeekendsOffThisMonth: 0 };
  });

  const lookbackDays = Math.max(service.consecutivenessRules?.maxConsecutiveWorkDays || 7, service.consecutivenessRules?.maxConsecutiveDaysOff || 7, 7);
  const sortedPreviousShifts = (previousMonthShifts || []).sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());

  for (const emp of employeesForService) {
    const state = employeeStates[emp.id];
    let currentConsecutiveWork = 0; let currentConsecutiveRest = 0;
    let lastTypeEncountered: EmployeeState['lastShiftType'] = undefined;
    let lastWorkShiftEnd: Date | null = null;

    for (let i = lookbackDays; i >= 1; i--) {
        const dateToCheck = subDays(firstDayOfCurrentMonth, i);
        const dateToCheckStr = format(dateToCheck, 'yyyy-MM-dd');
        const shiftToday = sortedPreviousShifts.find(s => s.date === dateToCheckStr && s.employeeName === emp.name);

        if (shiftToday) {
            const shiftType = getShiftTypeForEval(shiftToday);
            if (shiftType === 'M' || shiftType === 'T' || shiftType === 'N') {
                currentConsecutiveWork = (lastTypeEncountered === 'M' || lastTypeEncountered === 'T' || lastTypeEncountered === 'N') ? currentConsecutiveWork + 1 : 1;
                currentConsecutiveRest = 0;
                lastTypeEncountered = shiftType;
                const { endTime: shiftEndTimeStr } = getShiftDetails(shiftType);
                lastWorkShiftEnd = getShiftDateTime(dateToCheck, shiftEndTimeStr, shiftType === 'N');
            } else if (shiftType === 'D' || shiftType === 'F' || shiftType === 'LAO' || shiftType === 'LM' || shiftType === 'C') {
                currentConsecutiveRest = (lastTypeEncountered === 'D' || lastTypeEncountered === 'F' || lastTypeEncountered === 'LAO' || lastTypeEncountered === 'LM' || lastTypeEncountered === 'C' || lastTypeEncountered === undefined) ? currentConsecutiveRest + 1 : 1;
                currentConsecutiveWork = 0;
                lastTypeEncountered = shiftType;
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

    for (const emp of employeesForService) {
        const state = employeeStates[emp.id];
        const workPattern = emp.preferences?.workPattern;
        const isCurrentDayAWeekday = !isWeekendDay;

        if (workPattern === 'mondayToFridayMorning' || workPattern === 'mondayToFridayAfternoon') {
            const shiftCodeToAssign: 'M' | 'T' = workPattern === 'mondayToFridayMorning' ? 'M' : 'T';
            if (isCurrentDayAWeekday) {
                if (isHolidayDay) {
                    generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: 'F (Feriado - Patrón Fijo)' });
                    state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                    state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                } else {
                     if (canAssignShiftDueToRest(state, shiftCodeToAssign, currentDate)) {
                        const { startTime, endTime, notesSuffix } = getShiftDetails(shiftCodeToAssign);
                        generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime, endTime, notes: `Turno Patrón ${notesSuffix}` });
                        dailyAssignedWorkShifts.add(emp.id); state.shiftsThisMonth++;
                        state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                        state.consecutiveRestDays = 0; state.lastShiftType = shiftCodeToAssign;
                        state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, shiftCodeToAssign === 'N');
                        if (shiftCodeToAssign === 'M') staffingNeeds.morning--; else if (shiftCodeToAssign === 'T') staffingNeeds.afternoon--;
                    } else {
                        // Cannot assign fixed pattern due to rest, mark as error for eval
                    }
                }
            } else {
                generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: 'D (Descanso - Patrón Fijo)' });
                state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                state.consecutiveWorkDays = 0; state.lastShiftType = 'D';
            }
            dailyProcessedEmployees.add(emp.id);
        }
    }

    employeesForService.forEach(emp => {
      if (dailyProcessedEmployees.has(emp.id)) return;
      const state = employeeStates[emp.id];
      const fixedAssignment = isEmployeeOnFixedAssignmentOnDate(emp, currentDate);
      if (fixedAssignment && (fixedAssignment.type === 'LAO' || fixedAssignment.type === 'LM')) {
        generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: `${fixedAssignment.type}${fixedAssignment.description ? ` - ${fixedAssignment.description}` : ''}` });
        dailyProcessedEmployees.add(emp.id);
        state.consecutiveRestDays = (state.lastShiftType === fixedAssignment.type || state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
        state.consecutiveWorkDays = 0; state.lastShiftType = fixedAssignment.type;
      }
    });

    employeesForService.forEach(emp => {
        if (dailyProcessedEmployees.has(emp.id)) return;
        const workPattern = emp.preferences?.workPattern;
        if (workPattern && workPattern !== 'standardRotation') return;
        const state = employeeStates[emp.id];
        const preferences = emp.preferences;

        if (preferences?.fixedWeeklyShiftDays && preferences.fixedWeeklyShiftDays.includes(currentDayOfWeekName)) {
            const fixedTiming = preferences.fixedWeeklyShiftTiming;
            if (fixedTiming && fixedTiming !== NO_FIXED_TIMING_VALUE) {
                if (fixedTiming === REST_DAY_VALUE || fixedTiming.toUpperCase() === 'D') {
                    const shiftNote = isHolidayDay ? 'F (Feriado - Descanso Fijo)' : 'D (Fijo Semanal)';
                    const lastShiftTypeForState: EmployeeState['lastShiftType'] = isHolidayDay ? 'F' : 'D';
                    generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: shiftNote });
                    dailyProcessedEmployees.add(emp.id);
                    state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                    state.consecutiveWorkDays = 0; state.lastShiftType = lastShiftTypeForState;
                } else if (['mañana', 'tarde', 'noche'].includes(fixedTiming.toLowerCase())) {
                    const shiftCode = fixedTiming.toLowerCase().charAt(0).toUpperCase() as 'M' | 'T' | 'N';
                    if (shiftCode === 'N' && !service.enableNightShift) return; // Skip, eval will catch
                    if (!canAssignShiftDueToRest(state, shiftCode, currentDate)) return; // Skip, eval will catch

                    if (isHolidayDay && !isWeekendDay) {
                        generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: `F (Feriado - Cubría ${shiftCode})` });
                        dailyProcessedEmployees.add(emp.id);
                        state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                        state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                    } else {
                        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftCode);
                        generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime, endTime, notes: `Turno Fijo ${notesSuffix}` });
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

    const assignShiftsForType = (shiftType: 'M' | 'T' | 'N', getNeeded: () => number, decrementNeeded: () => void, notesDetail: string) => {
      let needed = getNeeded(); if (needed <= 0) return;
      const {startTime, endTime, notesSuffix} = getShiftDetails(shiftType);
      const maxWorkDays = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
      const minRestDaysRequired = service.consecutivenessRules?.minConsecutiveDaysOffRequiredBeforeWork || 1;
      
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
        .sort((a, b) => { /* complex sort logic from original */
            const stateA = employeeStates[a.id]; const stateB = employeeStates[b.id];
            const aWasResting = (stateA.lastShiftType === 'D' || stateA.lastShiftType === 'F' || stateA.lastShiftType === 'C' || stateA.lastShiftType === 'LAO' || stateA.lastShiftType === 'LM' || stateA.lastShiftType === undefined);
            const bWasResting = (stateB.lastShiftType === 'D' || stateB.lastShiftType === 'F' || stateB.lastShiftType === 'C' || stateB.lastShiftType === 'LAO' || stateB.lastShiftType === 'LM' || stateB.lastShiftType === undefined);
            const preferredRestDays = service.consecutivenessRules?.preferredConsecutiveDaysOff || minRestDaysRequired;
            const preferredWorkDays = service.consecutivenessRules?.preferredConsecutiveWorkDays || maxWorkDays;

            const aMetPreferredRest = aWasResting ? stateA.consecutiveRestDays >= preferredRestDays : false;
            const bMetPreferredRest = bWasResting ? stateB.consecutiveRestDays >= preferredRestDays : false;
            if (aMetPreferredRest && !bMetPreferredRest) return -1;
            if (!aMetPreferredRest && bMetPreferredRest) return 1;

            const aIsContinuingPreferredWorkBlock = !aWasResting && stateA.consecutiveWorkDays < preferredWorkDays;
            const bIsContinuingPreferredWorkBlock = !bWasResting && stateB.consecutiveWorkDays < preferredWorkDays;
            if (aIsContinuingPreferredWorkBlock && !bIsContinuingPreferredWorkBlock) return -1;
            if (!aIsContinuingPreferredWorkBlock && bIsContinuingPreferredWorkBlock) return 1;

            if (useWeekendHolidayStaffing && service.targetCompleteWeekendsOff && service.targetCompleteWeekendsOff > 0) {
                const prefersWeekendA = a.preferences?.prefersWeekendWork ?? false;
                const prefersWeekendB = b.preferences?.prefersWeekendWork ?? false;
                if (prefersWeekendA && !prefersWeekendB) return -1;
                if (!prefersWeekendA && prefersWeekendB) return 1;
            }

            if (stateA.shiftsThisMonth !== stateB.shiftsThisMonth) return stateA.shiftsThisMonth - stateB.shiftsThisMonth;
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
        generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: startTime, endTime: endTime, notes: `${notesDetail} ${notesSuffix}` });
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

    employeesForService.forEach(emp => {
      const state = employeeStates[emp.id];
      if (!dailyProcessedEmployees.has(emp.id)) {
        let shiftNote = isHolidayDay ? 'F (Feriado)' : 'D (Descanso)';
        const lastShiftTypeForState: EmployeeState['lastShiftType'] = isHolidayDay ? 'F' : 'D';

        if (currentDayOfWeekNum === 0 && service.targetCompleteWeekendsOff && service.targetCompleteWeekendsOff > 0) {
            const saturdayStr = format(subDays(currentDate, 1), 'yyyy-MM-dd');
            const saturdayShift = generatedShiftsOutput.find(s => s.employeeName === emp.name && s.date === saturdayStr);
            if (saturdayShift) {
                const saturdayShiftType = getShiftTypeForEval(saturdayShift);
                if (saturdayShiftType === 'D' || saturdayShiftType === 'F' || saturdayShiftType === 'LAO' || saturdayShiftType === 'LM' || saturdayShiftType === 'C') {
                    shiftNote = isHolidayDay ? 'F (FDS Objetivo - Feriado)' : 'D (FDS Objetivo)';
                }
            } else if (!saturdayShift) { // Si no hay turno el sábado, también es descanso.
                 shiftNote = isHolidayDay ? 'F (FDS Objetivo - Feriado)' : 'D (FDS Objetivo)';
            }
        }
        generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: shiftNote });
        dailyProcessedEmployees.add(emp.id);
        state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined || !state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
        state.consecutiveWorkDays = 0; state.lastShiftType = lastShiftTypeForState;
      }
    });
  }

  // Evaluación final del horario generado
  const evaluationResults = await evaluateScheduleMetrics(
    generatedShiftsOutput,
    service,
    month,
    year,
    allEmployees, // Pasamos todos, evaluateScheduleMetrics filtrará
    holidays,
    previousMonthShifts
  );

  return {
    generatedShifts: generatedShiftsOutput,
    responseText: evaluationResults.responseText,
    violations: evaluationResults.violations,
    score: evaluationResults.score,
    scoreBreakdown: evaluationResults.scoreBreakdown,
  };
}
