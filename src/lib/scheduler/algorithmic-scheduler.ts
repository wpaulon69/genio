
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

// --- Interfaces de Configuración de Reglas ---

/**
 * Define las penalizaciones de puntuación para diferentes tipos de violaciones de reglas.
 */
interface ScorePenalties {
  /** Penalización por violar el descanso mínimo entre turnos. */
  minRestBetweenShiftsViolation: number;
  /** Penalización por violar el descanso mínimo requerido antes de comenzar un bloque de trabajo. */
  minRestBeforeWorkViolation: number;
  /** Penalización por exceder el máximo de días de trabajo consecutivos. */
  maxConsecutiveWorkDaysViolation: number;
  /** Penalización (usualmente como advertencia) por exceder el máximo de días de descanso consecutivos. */
  maxConsecutiveDaysOffViolation: number;
  /** Penalización por cada empleado faltante para cubrir la dotación requerida. */
  staffingShortagePerEmployee: number;
  /** Penalización por cada fin de semana completo de descanso no otorgado respecto al objetivo. */
  weekendTargetNotMetPerWeekend: number;
  /** Penalización máxima total por no cumplir el objetivo de fines de semana de descanso. */
  maxWeekendTargetPenalty: number;
}

/**
 * Configuración de reglas para el algoritmo de generación y evaluación de horarios.
 */
export interface ScheduleRulesConfig {
  /** Mínimo de horas de descanso requeridas entre el final de un turno y el inicio del siguiente. */
  minimumRestHoursBetweenShifts: number;
  /** Máximo número de días de trabajo consecutivos permitidos. */
  maxConsecutiveWorkDays: number;
  /** Número preferido de días de trabajo consecutivos (para optimización). */
  preferredConsecutiveWorkDays: number;
  /** Máximo número de días de descanso consecutivos permitidos (generalmente una advertencia si se supera). */
  maxConsecutiveDaysOff: number;
  /** Número preferido de días de descanso consecutivos. */
  preferredConsecutiveDaysOff: number;
  /** Mínimo número de días de descanso consecutivos requeridos antes de volver a trabajar. */
  minConsecutiveDaysOffRequiredBeforeWork: number;
  /**
   * Objetivo por defecto de fines de semana completos (Sábado+Domingo) de descanso al mes por empleado.
   * El valor específico del servicio (`service.targetCompleteWeekendsOff`) tendrá prioridad si está definido.
   */
  defaultTargetCompleteWeekendsOff: number;
  /** Objeto que contiene las penalizaciones de puntuación para violaciones. */
  scorePenalties: ScorePenalties;
}

/**
 * Configuración por defecto para las reglas del horario.
 * Estos valores se usan si no se proporciona una configuración específica.
 */
const defaultScheduleRulesConfig: ScheduleRulesConfig = {
  minimumRestHoursBetweenShifts: 12,
  maxConsecutiveWorkDays: 7,
  preferredConsecutiveWorkDays: 5,
  maxConsecutiveDaysOff: 4, // Ajustado de 7 a 4 para ser más realista para advertencias
  preferredConsecutiveDaysOff: 2,
  minConsecutiveDaysOffRequiredBeforeWork: 1,
  defaultTargetCompleteWeekendsOff: 1,
  scorePenalties: {
    minRestBetweenShiftsViolation: 10,
    minRestBeforeWorkViolation: 5,
    maxConsecutiveWorkDaysViolation: 5,
    maxConsecutiveDaysOffViolation: 1, // Penalización suave como advertencia
    staffingShortagePerEmployee: 5,
    weekendTargetNotMetPerWeekend: 2,
    maxWeekendTargetPenalty: 10,
  },
};


// --- Interfaces y Tipos Internos ---

/**
 * @interface AlgorithmicScheduleOutput
 * Define la estructura de salida de la función `generateAlgorithmicSchedule`.
 */
interface AlgorithmicScheduleOutput {
  generatedShifts: AIShift[];
  responseText: string;
  violations: ScheduleViolation[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

/**
 * @interface EmployeeState
 * Mantiene el estado de un empleado durante el proceso de generación o evaluación del horario.
 */
interface EmployeeState {
  id: string;
  name: string;
  consecutiveWorkDays: number;
  consecutiveRestDays: number;
  shiftsThisMonth: number;
  lastShiftType?: AIShift['notes'] | 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F';
  lastActualWorkShiftEndTime: Date | null;
  completeWeekendsOffThisMonth: number;
}

/**
 * @interface EvaluationContext
 * Contiene los resultados acumulados durante la evaluación de un horario.
 */
interface EvaluationContext {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  violations: ScheduleViolation[];
}

const NO_FIXED_TIMING_VALUE = "none_selected";
const REST_DAY_VALUE = "rest_day";


// --- Funciones Auxiliares ---

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

function getShiftDateTime(baseDate: Date, timeString: string, isNightShiftEndTime: boolean = false): Date {
  if (!timeString) return new Date(baseDate);
  const [hours, minutes] = timeString.split(':').map(Number);
  const shiftDate = new Date(baseDate);
  shiftDate.setHours(hours, minutes, 0, 0);
  if (isNightShiftEndTime && hours < 12) {
    shiftDate.setDate(baseDate.getDate() + 1);
  }
  return shiftDate;
}

/**
 * Verifica si asignar un turno de trabajo respeta el descanso mínimo configurado.
 * @param employeeState Estado actual del empleado.
 * @param shiftCodeToAssign Código del turno a asignar (M, T, N).
 * @param currentDate Fecha actual del turno.
 * @param rulesConfig Configuración de reglas del horario.
 * @returns {boolean} True si se puede asignar, false si no.
 */
function canAssignShiftDueToRest(
  employeeState: EmployeeState,
  shiftCodeToAssign: 'M' | 'T' | 'N',
  currentDate: Date,
  rulesConfig: ScheduleRulesConfig
): boolean {
  if (!employeeState.lastActualWorkShiftEndTime) {
    return true;
  }
  const { startTime: currentShiftStartTimeStr } = getShiftDetails(shiftCodeToAssign);
  const currentShiftStartTime = getShiftDateTime(currentDate, currentShiftStartTimeStr, false);
  const hoursDifference = (currentShiftStartTime.getTime() - employeeState.lastActualWorkShiftEndTime.getTime()) / (1000 * 60 * 60);
  return hoursDifference >= rulesConfig.minimumRestHoursBetweenShifts;
}

const normalizeDayName = (dayName: string): string => {
  if (!dayName) return '';
  return dayName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

const getShiftTypeForEval = (shift: AIShift): 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F' => {
    const note = shift.notes?.trim().toUpperCase();
    const startTime = shift.startTime?.trim();
    if (note?.startsWith('LAO')) return 'LAO';
    if (note?.startsWith('LM')) return 'LM';
    if (note === 'C' || note === 'C (FRANCO COMP.)' || note?.includes('FRANCO COMP')) return 'C';
    if (note === 'F' || note === 'F (FERIADO)' || note?.includes('FERIADO')) return 'F';
    if (note === 'D' || note === 'D (DESCANSO)' || note?.includes('DESCANSO') || note === 'D (FIJO SEMANAL)' || note === 'D (FDS OBJETIVO)') return 'D';
    if (note?.includes('(M)') || note?.includes('MAÑANA') || startTime?.startsWith('07:') || startTime?.startsWith('08:')) return 'M';
    if (note?.includes('(T)') || note?.includes('TARDE') || startTime?.startsWith('14:') || startTime?.startsWith('15:')) return 'T';
    if (note?.includes('(N)') || note?.includes('NOCHE') || startTime?.startsWith('22:') || startTime?.startsWith('23:')) return 'N';
    return 'D';
};

/**
 * Inicializa el estado de los empleados basándose en los turnos del mes anterior.
 * @param employeesForService Array de empleados para el servicio.
 * @param previousMonthShifts Turnos del mes anterior.
 * @param rulesConfig Configuración de reglas del horario.
 * @param firstDayOfCurrentMonth Primer día del mes actual.
 * @returns {Record<string, EmployeeState>} Estado inicializado de los empleados.
 */
function initializeEmployeeStatesFromHistory(
  employeesForService: Employee[],
  previousMonthShifts: AIShift[] | null,
  rulesConfig: ScheduleRulesConfig,
  firstDayOfCurrentMonth: Date
): Record<string, EmployeeState> {
  const employeeStates: Record<string, EmployeeState> = {};
  const sortedPreviousShifts = (previousMonthShifts || []).sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
  const lookbackDays = Math.max(rulesConfig.maxConsecutiveWorkDays, rulesConfig.maxConsecutiveDaysOff, 7);

  employeesForService.forEach(emp => {
    let currentConsecutiveWork = 0;
    let currentConsecutiveRest = 0;
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
        currentConsecutiveWork = 0;
        lastTypeEncountered = 'D';
      }
    }
    employeeStates[emp.id] = {
      id: emp.id,
      name: emp.name,
      consecutiveWorkDays: currentConsecutiveWork,
      consecutiveRestDays: currentConsecutiveRest,
      shiftsThisMonth: 0,
      lastShiftType: lastTypeEncountered,
      lastActualWorkShiftEndTime: lastWorkShiftEnd,
      completeWeekendsOffThisMonth: 0
    };
  });
  return employeeStates;
}

/**
 * Evalúa el cumplimiento del objetivo de fines de semana de descanso.
 * @param shiftsToEvaluate Turnos a evaluar.
 * @param service Configuración del servicio.
 * @param monthStr Mes actual (string).
 * @param yearStr Año actual (string).
 * @param employeesForService Empleados del servicio.
 * @param evalCtx Contexto de evaluación (se modifica directamente).
 * @param rulesConfig Configuración de reglas del horario.
 */
function evaluateWeekendTargetCompliance(
    shiftsToEvaluate: AIShift[],
    service: Service,
    monthStr: string,
    yearStr: string,
    employeesForService: Employee[],
    evalCtx: EvaluationContext,
    rulesConfig: ScheduleRulesConfig
): void {
    const targetWeekends = service.targetCompleteWeekendsOff ?? rulesConfig.defaultTargetCompleteWeekendsOff;
    if (!targetWeekends || targetWeekends <= 0) {
        return;
    }

    const monthInt = parseInt(monthStr, 10);
    const yearInt = parseInt(yearStr, 10);
    const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));

    employeesForService.forEach(emp => {
        let completeWeekendsOffCount = 0;
        for (let dayIter = 1; dayIter <= daysInMonthCount; dayIter++) {
            const date = new Date(yearInt, monthInt - 1, dayIter);
            if (getDay(date) === 6) { 
                const saturdayStr = format(date, 'yyyy-MM-dd');
                const sundayDate = addDays(date, 1);
                
                if (sundayDate.getMonth() === monthInt - 1) { 
                    const sundayStr = format(sundayDate, 'yyyy-MM-dd');
                    const saturdayShift = shiftsToEvaluate.find(s => s.employeeName === emp.name && s.date === saturdayStr);
                    const sundayShift = shiftsToEvaluate.find(s => s.employeeName === emp.name && s.date === sundayStr);
                    let isSatOff = !saturdayShift || ['D', 'F', 'LAO', 'LM', 'C'].includes(getShiftTypeForEval(saturdayShift));
                    let isSunOff = !sundayShift || ['D', 'F', 'LAO', 'LM', 'C'].includes(getShiftTypeForEval(sundayShift));
                    if (isSatOff && isSunOff) {
                        completeWeekendsOffCount++;
                    }
                }
            }
        }

        if (completeWeekendsOffCount < targetWeekends) {
            const penaltyValue = (targetWeekends - completeWeekendsOffCount) * rulesConfig.scorePenalties.weekendTargetNotMetPerWeekend;
            const cappedPenalty = Math.min(rulesConfig.scorePenalties.maxWeekendTargetPenalty, penaltyValue);
            evalCtx.violations.push({
                employeeName: emp.name,
                rule: "Objetivo FDS Descanso No Alcanzado",
                details: `${emp.name} tuvo ${completeWeekendsOffCount} FDS de descanso completo (Objetivo: ${targetWeekends}).`,
                severity: 'warning',
                category: 'employeeWellbeing',
                shiftType: 'General',
                date: `${yearStr}-${String(monthInt).padStart(2, '0')}`
            });
            evalCtx.score -= cappedPenalty;
            evalCtx.scoreBreakdown.employeeWellbeing -= cappedPenalty;
        }
    });
}


// --- Funciones Principales Exportadas ---

/**
 * Evalúa un conjunto completo de turnos para un servicio, mes y año dados.
 * @param shiftsToEvaluate Array de turnos a evaluar.
 * @param service Objeto del servicio.
 * @param monthStr Mes del horario (1-12).
 * @param yearStr Año del horario.
 * @param allEmployees Lista de todos los empleados.
 * @param allHolidays Lista de todos los feriados.
 * @param previousMonthShifts Turnos del mes anterior.
 * @param rulesConfig Configuración de reglas del horario.
 * @returns {Promise<AlgorithmicScheduleOutput>} Puntuación, violaciones, desglose y texto resumen.
 */
export async function evaluateScheduleMetrics(
  shiftsToEvaluate: AIShift[],
  service: Service,
  monthStr: string,
  yearStr: string,
  allEmployees: Employee[],
  allHolidays: Holiday[],
  previousMonthShifts: AIShift[] | null,
  rulesConfig: ScheduleRulesConfig = defaultScheduleRulesConfig
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

    const employeeStates = initializeEmployeeStatesFromHistory(employeesForService, previousMonthShifts, rulesConfig, firstDayOfCurrentMonth);

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
            
            const shiftType = shiftForEmployeeToday ? getShiftTypeForEval(shiftForEmployeeToday) : 'D'; 

            if (shiftType === 'M' || shiftType === 'T' || shiftType === 'N') {
                state.shiftsThisMonth++;
                dailyStaffing[shiftType]++;

                if (!canAssignShiftDueToRest(state, shiftType, currentDate, rulesConfig)) {
                    evalCtx.violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType, rule: "Violación Descanso Mínimo entre Turnos", details: `No se respetaron las ${rulesConfig.minimumRestHoursBetweenShifts}h de descanso. Último turno laboral terminó ${state.lastActualWorkShiftEndTime ? format(state.lastActualWorkShiftEndTime, 'Pp', {locale:es}) : 'N/A'}.`, severity: 'error', category: 'employeeWellbeing' });
                    evalCtx.score -= rulesConfig.scorePenalties.minRestBetweenShiftsViolation; evalCtx.scoreBreakdown.employeeWellbeing -= rulesConfig.scorePenalties.minRestBetweenShiftsViolation;
                }

                const wasResting = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
                if (wasResting && state.consecutiveRestDays < rulesConfig.minConsecutiveDaysOffRequiredBeforeWork) {
                    evalCtx.violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType, rule: "Violación Mínimo Descanso Antes de Trabajar", details: `Comienza trabajo con ${state.consecutiveRestDays} día(s) de descanso (requerido: ${rulesConfig.minConsecutiveDaysOffRequiredBeforeWork}).`, severity: 'error', category: 'serviceRule' });
                    evalCtx.score -= rulesConfig.scorePenalties.minRestBeforeWorkViolation; evalCtx.scoreBreakdown.serviceRules -= rulesConfig.scorePenalties.minRestBeforeWorkViolation;
                }

                state.consecutiveWorkDays = wasResting ? 1 : state.consecutiveWorkDays + 1;
                state.consecutiveRestDays = 0;
                state.lastShiftType = shiftType;
                const { endTime: shiftEndTimeStr } = getShiftDetails(shiftType);
                state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, shiftEndTimeStr, shiftType === 'N');

                if (state.consecutiveWorkDays > rulesConfig.maxConsecutiveWorkDays) {
                    evalCtx.violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType, rule: "Exceso Días Trabajo Consecutivos", details: `Trabajó ${state.consecutiveWorkDays} días (máx: ${rulesConfig.maxConsecutiveWorkDays}).`, severity: 'error', category: 'serviceRule' });
                    evalCtx.score -= rulesConfig.scorePenalties.maxConsecutiveWorkDaysViolation; evalCtx.scoreBreakdown.serviceRules -= rulesConfig.scorePenalties.maxConsecutiveWorkDaysViolation;
                }

            } else { 
                state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined || !state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
                state.consecutiveWorkDays = 0;
                state.lastShiftType = shiftType || 'D'; 

                if (state.consecutiveRestDays > rulesConfig.maxConsecutiveDaysOff) {
                    evalCtx.violations.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General', rule: "Exceso Días Descanso Consecutivos", details: `Descansó ${state.consecutiveRestDays} días (máx: ${rulesConfig.maxConsecutiveDaysOff}).`, severity: 'warning', category: 'employeeWellbeing' });
                    evalCtx.score -= rulesConfig.scorePenalties.maxConsecutiveDaysOffViolation; evalCtx.scoreBreakdown.employeeWellbeing -= rulesConfig.scorePenalties.maxConsecutiveDaysOffViolation;
                }
            }
        }

        const staffingNeedsConfig = {
            morning: useWeekendHolidayStaffing ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
            afternoon: useWeekendHolidayStaffing ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
            night: (service.enableNightShift && useWeekendHolidayStaffing) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
        };

        if (dailyStaffing.M < staffingNeedsConfig.morning) {
            const diff = staffingNeedsConfig.morning - dailyStaffing.M;
            evalCtx.violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'M', rule: "Falta de Personal", details: `Faltan ${diff} empleado(s) para Mañana.`, severity: 'error', category: 'serviceRule' });
            evalCtx.score -= diff * rulesConfig.scorePenalties.staffingShortagePerEmployee; evalCtx.scoreBreakdown.serviceRules -= diff * rulesConfig.scorePenalties.staffingShortagePerEmployee;
        }
        if (dailyStaffing.T < staffingNeedsConfig.afternoon) {
            const diff = staffingNeedsConfig.afternoon - dailyStaffing.T;
            evalCtx.violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'T', rule: "Falta de Personal", details: `Faltan ${diff} empleado(s) para Tarde.`, severity: 'error', category: 'serviceRule' });
            evalCtx.score -= diff * rulesConfig.scorePenalties.staffingShortagePerEmployee; evalCtx.scoreBreakdown.serviceRules -= diff * rulesConfig.scorePenalties.staffingShortagePerEmployee;
        }
        if (service.enableNightShift && dailyStaffing.N < staffingNeedsConfig.night) {
            const diff = staffingNeedsConfig.night - dailyStaffing.N;
            evalCtx.violations.push({ date: currentDateStrYYYYMMDD, shiftType: 'N', rule: "Falta de Personal", details: `Faltan ${diff} empleado(s) para Noche.`, severity: 'error', category: 'serviceRule' });
            evalCtx.score -= diff * rulesConfig.scorePenalties.staffingShortagePerEmployee; evalCtx.scoreBreakdown.serviceRules -= diff * rulesConfig.scorePenalties.staffingShortagePerEmployee;
        }
    }

    evaluateWeekendTargetCompliance(shiftsToEvaluate, service, monthStr, yearStr, employeesForService, evalCtx, rulesConfig);

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
        generatedShifts: shiftsToEvaluate, 
        responseText: responseSummary,
        violations: evalCtx.violations,
        score: finalScore,
        scoreBreakdown: evalCtx.scoreBreakdown,
    };
}

/**
 * Genera un horario de turnos algorítmicamente.
 * @param service Objeto del servicio.
 * @param month Mes del horario (1-12).
 * @param year Año del horario.
 * @param allEmployees Lista de todos los empleados.
 * @param holidays Lista de feriados.
 * @param previousMonthShifts Turnos del mes anterior.
 * @param rulesConfig Configuración de reglas del horario.
 * @returns {Promise<AlgorithmicScheduleOutput>} Horario generado, texto resumen, violaciones, puntuación y desglose.
 */
export async function generateAlgorithmicSchedule(
  service: Service,
  month: string,
  year: string,
  allEmployees: Employee[],
  holidays: Holiday[],
  previousMonthShifts: AIShift[] | null,
  rulesConfig: ScheduleRulesConfig = defaultScheduleRulesConfig
): Promise<AlgorithmicScheduleOutput> {
  
  let bestScore: number = -1;
  let bestScheduleShifts: AIShift[] = [];
  let bestViolations: ScheduleViolation[] = [];
  let bestScoreBreakdown: ScoreBreakdown = { serviceRules: 0, employeeWellbeing: 0 };
  let bestResponseText: string = "No se pudo generar un horario inicial.";
  
  let attemptsMade = 0;
  const maxAttempts = 15;
  const targetScore = 80;

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
      scoreBreakdown: { serviceRules: 0, employeeWellbeing: 100 }, // employeeWellbeing 100 as no employees to affect
      responseText: `No hay empleados asignados al servicio ${service.name}. No se pudo generar el horario.`
    };
  }

  while ((bestScore < targetScore || bestScore === -1) && attemptsMade < maxAttempts) {
    attemptsMade++;
    let currentGeneratedShifts: AIShift[] = [];
    const employeeStates = initializeEmployeeStatesFromHistory(employeesForService, previousMonthShifts, rulesConfig, firstDayOfCurrentMonth);
    
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
                      currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: 'F (Feriado - Patrón Fijo)' });
                      state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                      state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                  } else { 
                       if (canAssignShiftDueToRest(state, shiftCodeToAssign, currentDate, rulesConfig)) {
                          const { startTime, endTime, notesSuffix } = getShiftDetails(shiftCodeToAssign);
                          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime, endTime, notes: `Turno Patrón ${notesSuffix}` });
                          dailyAssignedWorkShifts.add(emp.id); state.shiftsThisMonth++;
                          state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                          state.consecutiveRestDays = 0; state.lastShiftType = shiftCodeToAssign;
                          state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, shiftCodeToAssign === 'N');
                          if (shiftCodeToAssign === 'M') staffingNeeds.morning = Math.max(0, staffingNeeds.morning - 1);
                          else if (shiftCodeToAssign === 'T') staffingNeeds.afternoon = Math.max(0, staffingNeeds.afternoon - 1);
                      }
                  }
              } else { 
                  currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: 'D (Descanso - Patrón Fijo)' });
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
          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: `${fixedAssignment.type}${fixedAssignment.description ? ` - ${fixedAssignment.description}` : ''}` });
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
                      currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: shiftNote });
                      dailyProcessedEmployees.add(emp.id);
                      state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                      state.consecutiveWorkDays = 0; state.lastShiftType = lastShiftTypeForState;
                  } else if (['mañana', 'tarde', 'noche'].includes(fixedTiming.toLowerCase())) {
                      const shiftCode = fixedTiming.toLowerCase().charAt(0).toUpperCase() as 'M' | 'T' | 'N';
                      if (shiftCode === 'N' && !service.enableNightShift) return; 
                      if (!canAssignShiftDueToRest(state, shiftCode, currentDate, rulesConfig)) return;
                      if (isHolidayDay && !isWeekendDay) { 
                          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: `F (Feriado - Cubría ${shiftCode})` });
                          dailyProcessedEmployees.add(emp.id);
                          state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                          state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                      } else { 
                          const {startTime, endTime, notesSuffix} = getShiftDetails(shiftCode);
                          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime, endTime, notes: `Turno Fijo ${notesSuffix}` });
                          dailyAssignedWorkShifts.add(emp.id); dailyProcessedEmployees.add(emp.id); state.shiftsThisMonth++;
                          state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                          state.consecutiveRestDays = 0; state.lastShiftType = shiftCode;
                          state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, shiftCode === 'N');
                          if (shiftCode === 'M') staffingNeeds.morning = Math.max(0, staffingNeeds.morning - 1);
                          else if (shiftCode === 'T') staffingNeeds.afternoon = Math.max(0, staffingNeeds.afternoon - 1);
                          else if (shiftCode === 'N') staffingNeeds.night = Math.max(0, staffingNeeds.night - 1);
                      }
                  }
              }
          }
      });

      const assignShiftsForType = (shiftType: 'M' | 'T' | 'N', getNeeded: () => number, decrementNeeded: () => void, notesDetail: string) => {
        let needed = getNeeded(); if (needed <= 0) return;
        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftType);
        const maxWorkDays = rulesConfig.maxConsecutiveWorkDays;
        const minRestDaysRequired = rulesConfig.minConsecutiveDaysOffRequiredBeforeWork;
        
        const availableForWork = employeesForService
          .filter(emp => !dailyProcessedEmployees.has(emp.id) && !dailyAssignedWorkShifts.has(emp.id)) 
          .filter(emp => { 
              const state = employeeStates[emp.id];
              if (!canAssignShiftDueToRest(state, shiftType, currentDate, rulesConfig)) return false;
              const wasResting = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
              const hasEnoughMinRest = wasResting ? state.consecutiveRestDays >= minRestDaysRequired : true;
              if (state.consecutiveWorkDays >= maxWorkDays) return false; 
              return hasEnoughMinRest;
          })
          .sort((a, b) => { 
              const stateA = employeeStates[a.id]; const stateB = employeeStates[b.id];
              const aWasResting = (stateA.lastShiftType === 'D' || stateA.lastShiftType === 'F' || stateA.lastShiftType === 'C' || stateA.lastShiftType === 'LAO' || stateA.lastShiftType === 'LM' || stateA.lastShiftType === undefined);
              const bWasResting = (stateB.lastShiftType === 'D' || stateB.lastShiftType === 'F' || stateB.lastShiftType === 'C' || stateB.lastShiftType === 'LAO' || stateB.lastShiftType === 'LM' || stateB.lastShiftType === undefined);
              const preferredRestDays = rulesConfig.preferredConsecutiveDaysOff;
              const preferredWorkDays = rulesConfig.preferredConsecutiveWorkDays;

              const aMetPreferredRest = aWasResting ? stateA.consecutiveRestDays >= preferredRestDays : false;
              const bMetPreferredRest = bWasResting ? stateB.consecutiveRestDays >= preferredRestDays : false;
              if (aMetPreferredRest && !bMetPreferredRest) return -1; 
              if (!aMetPreferredRest && bMetPreferredRest) return 1;  

              const aIsContinuingPreferredWorkBlock = !aWasResting && stateA.consecutiveWorkDays < preferredWorkDays;
              const bIsContinuingPreferredWorkBlock = !bWasResting && stateB.consecutiveWorkDays < preferredWorkDays;
              if (aIsContinuingPreferredWorkBlock && !bIsContinuingPreferredWorkBlock) return -1;
              if (!aIsContinuingPreferredWorkBlock && bIsContinuingPreferredWorkBlock) return 1;
              
              const targetWeekends = service.targetCompleteWeekendsOff ?? rulesConfig.defaultTargetCompleteWeekendsOff;
              if (useWeekendHolidayStaffing && targetWeekends && targetWeekends > 0) {
                  const aPrefersWeekend = a.preferences?.prefersWeekendWork ?? false;
                  const bPrefersWeekend = b.preferences?.prefersWeekendWork ?? false;
                  if (aPrefersWeekend && !bPrefersWeekend) return -1; 
                  if (!aPrefersWeekend && bPrefersWeekend) return 1;  
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
          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: startTime, endTime: endTime, notes: `${notesDetail} ${notesSuffix}` });
          dailyAssignedWorkShifts.add(emp.id); dailyProcessedEmployees.add(emp.id); state.shiftsThisMonth++;
          state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
          state.consecutiveRestDays = 0; state.lastShiftType = shiftType;
          state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, shiftType === 'N');
          decrementNeeded(); needed = getNeeded();
        }
      };

      assignShiftsForType('M', () => staffingNeeds.morning, () => staffingNeeds.morning = Math.max(0, staffingNeeds.morning - 1), "Turno Mañana");
      assignShiftsForType('T', () => staffingNeeds.afternoon, () => staffingNeeds.afternoon = Math.max(0, staffingNeeds.afternoon - 1), "Turno Tarde");
      if (service.enableNightShift) assignShiftsForType('N', () => staffingNeeds.night, () => staffingNeeds.night = Math.max(0, staffingNeeds.night - 1), "Turno Noche");

      employeesForService.forEach(emp => {
        const state = employeeStates[emp.id];
        if (!dailyProcessedEmployees.has(emp.id)) { 
          let shiftNote = isHolidayDay ? 'F (Feriado)' : 'D (Descanso)';
          const lastShiftTypeForState: EmployeeState['lastShiftType'] = isHolidayDay ? 'F' : 'D';
          const targetWeekends = service.targetCompleteWeekendsOff ?? rulesConfig.defaultTargetCompleteWeekendsOff;
          if ((currentDayOfWeekNum === 0 || currentDayOfWeekNum === 6) && targetWeekends && targetWeekends > 0) {
              let isOtherWeekendDayOff = false;
              const otherWeekendDayDate = (currentDayOfWeekNum === 6) ? addDays(currentDate, 1) : subDays(currentDate, 1);
              if (otherWeekendDayDate.getMonth() === monthInt - 1) { 
                  const otherWeekendDayStr = format(otherWeekendDayDate, 'yyyy-MM-dd');
                  const otherDayShift = currentGeneratedShifts.find(s => s.employeeName === emp.name && s.date === otherWeekendDayStr);
                  if (!otherDayShift) { 
                      isOtherWeekendDayOff = true;
                  } else {
                      const otherShiftType = getShiftTypeForEval(otherDayShift);
                      isOtherWeekendDayOff = otherShiftType === 'D' || otherShiftType === 'F' || otherShiftType === 'LAO' || otherShiftType === 'LM' || otherShiftType === 'C';
                  }
              }
              if (isOtherWeekendDayOff) { 
                  shiftNote = isHolidayDay ? 'F (FDS Objetivo - Feriado)' : 'D (FDS Objetivo)';
              }
          }

          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: shiftNote });
          dailyProcessedEmployees.add(emp.id);
          state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined || !state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
          state.consecutiveWorkDays = 0; state.lastShiftType = lastShiftTypeForState;
        }
      });
    } 

    const currentEvaluationResults = await evaluateScheduleMetrics(
      currentGeneratedShifts,
      service,
      month,
      year,
      allEmployees,
      holidays,
      previousMonthShifts,
      rulesConfig 
    );

    if (attemptsMade === 1 || currentEvaluationResults.score > bestScore) {
      bestScore = currentEvaluationResults.score;
      bestScheduleShifts = [...currentGeneratedShifts];
      bestViolations = [...currentEvaluationResults.violations];
      bestScoreBreakdown = { ...currentEvaluationResults.scoreBreakdown };
      bestResponseText = currentEvaluationResults.responseText;
    }
    
  } 

  if (bestScore === -1 && attemptsMade > 0) { 
    bestResponseText = "El algoritmo no pudo generar un horario inicial. Revise la configuración del servicio y los empleados.";
  } else if (attemptsMade === maxAttempts && bestScore < targetScore) { // bestScore can be 0 or positive here
    bestResponseText += ` (Se alcanzó el máximo de ${maxAttempts} intentos sin superar el objetivo de ${targetScore} puntos.)`;
  }

  return {
    generatedShifts: bestScheduleShifts,
    responseText: bestResponseText,
    violations: bestViolations,
    score: bestScore === -1 ? 0 : bestScore, // Ensure score is not -1 if no schedule generated
    scoreBreakdown: bestScoreBreakdown,
  };
}
