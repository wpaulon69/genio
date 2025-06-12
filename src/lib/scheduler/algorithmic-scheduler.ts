
'use server';

import type { Service, Employee, FixedAssignment, Holiday, ScheduleViolation, AIShift, WorkPattern, ScoreBreakdown } from '@/lib/types';
import { format, getDaysInMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getDay, subDays, isValid, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { SHIFT_OPTIONS } from '@/lib/constants/schedule-constants';

/**
 * @fileOverview Algoritmo para la generación automática de horarios de turnos.
 * Este módulo contiene la lógica principal para crear un horario mensual para un servicio,
 * considerando las reglas del servicio, las preferencias y asignaciones fijas de los empleados,
 * los feriados y la continuidad con el horario del mes anterior.
 * El algoritmo intenta optimizar la cobertura de turnos y el bienestar del personal,
 * y evalúa el horario resultante generando una puntuación y una lista de violaciones.
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
 * Mantiene el estado de un empleado durante el proceso de generación del horario.
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
   * Importante para calcular la regla de descanso de 12 horas.
   */
  lastActualWorkShiftEndTime: Date | null;
  /** Número de fines de semana completos (Sábado + Domingo de descanso) que el empleado ha tenido en el mes actual.
   * Este campo se actualiza en la evaluación final, no se usa activamente durante la asignación de turnos.
   */
  completeWeekendsOffThisMonth: number;
}

/**
 * @interface EvaluationResult
 * Define la estructura de salida de la función `evaluateGeneratedSchedule`.
 */
interface EvaluationResult {
    /** Violaciones adicionales detectadas por la evaluación post-generación. */
    additionalViolations: ScheduleViolation[];
    /** Penalización total a aplicar a la puntuación general. */
    scorePenalty: number;
    /** Penalizaciones a aplicar a las categorías del desglose de la puntuación. */
    scoreBreakdownPenalties: {
        serviceRules: number;
        employeeWellbeing: number;
    };
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
    // Valida que las fechas de la asignación sean correctas antes de usarlas.
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
    // Retorna valores por defecto si no se encuentra la opción (aunque no debería ocurrir con tipos correctos).
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
  const [hours, minutes] = timeString.split(':').map(Number);
  const shiftDate = new Date(baseDate); // Clona baseDate para evitar modificar el original.
  shiftDate.setHours(hours, minutes, 0, 0);

  // Si es la hora de finalización de un turno de noche y la hora es antes del mediodía (ej., 07:00),
  // significa que esta hora cae en el día calendario siguiente al inicio del turno de noche.
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
  // Si no hay registro del último turno de trabajo, se puede asignar.
  if (!employeeState.lastActualWorkShiftEndTime) {
    return true;
  }

  const { startTime: currentShiftStartTimeStr } = getShiftDetails(shiftCodeToAssign);
  // El turno actual siempre comienza en `currentDate` (isNightShiftEndTime = false).
  const currentShiftStartTime = getShiftDateTime(currentDate, currentShiftStartTimeStr, false);

  // Calcula la diferencia en horas desde la finalización del último turno de trabajo.
  const hoursDifference = (currentShiftStartTime.getTime() - employeeState.lastActualWorkShiftEndTime.getTime()) / (1000 * 60 * 60);

  return hoursDifference >= 12; // Asume una regla de 12 horas de descanso.
}

/**
 * Normaliza un nombre de día de la semana (ej. "Miércoles" a "miercoles").
 * Elimina acentos y convierte a minúsculas.
 * @param {string} dayName - El nombre del día a normalizar.
 * @returns {string} El nombre del día normalizado.
 */
const normalizeDayName = (dayName: string): string => {
  if (!dayName) return '';
  return dayName
    .normalize("NFD") // Normaliza a forma descompuesta (letra + diacrítico).
    .replace(/[\u0300-\u036f]/g, "") // Elimina los diacríticos.
    .toLowerCase(); // Convierte a minúsculas.
};

/**
 * Obtiene el tipo de turno ('M', 'T', 'N', 'D', etc.) a partir de un objeto AIShift.
 * Se utiliza para la evaluación y toma de decisiones basada en el tipo de turno.
 * @param {AIShift} shift - El turno a evaluar.
 * @returns {'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F' | null} El tipo de turno, o null si no se puede determinar.
 */
const getShiftTypeForEval = (shift: AIShift): 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F' | null => {
    const note = shift.notes?.toUpperCase();
    if (!note) { // Si no hay notas pero tiene hora de inicio/fin, intenta inferir M/T/N.
        if (shift.startTime) {
            if (shift.startTime.startsWith('07:') || shift.startTime.startsWith('08:')) return 'M';
            if (shift.startTime.startsWith('14:') || shift.startTime.startsWith('15:')) return 'T';
            if (shift.startTime.startsWith('22:') || shift.startTime.startsWith('23:')) return 'N';
        }
        return null;
    }
    // Infiere el tipo de turno basado en las notas.
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
 * Evalúa un conjunto de turnos generados contra reglas específicas post-generación,
 * como el cumplimiento del objetivo de fines de semana completos de descanso.
 *
 * @param {AIShift[]} generatedShifts - Los turnos generados a evaluar.
 * @param {Service} service - El servicio para el cual se generó el horario.
 * @param {string} month - El mes del horario (1-12).
 * @param {string} year - El año del horario.
 * @param {Employee[]} employeesForService - Lista de empleados asignados al servicio.
 * @param {Holiday[]} holidays - Lista de feriados.
 * @returns {EvaluationResult} Un objeto con las violaciones adicionales y las penalizaciones de puntuación.
 */
function evaluateGeneratedSchedule(
    generatedShifts: AIShift[],
    service: Service,
    month: string,
    year: string,
    employeesForService: Employee[],
    holidays: Holiday[] // holidays no se usa en esta versión de la función, pero se mantiene para futuras reglas.
): EvaluationResult {
    const additionalViolations: ScheduleViolation[] = [];
    let scorePenalty = 0;
    const scoreBreakdownPenalties = { serviceRules: 0, employeeWellbeing: 0 };

    const monthInt = parseInt(month, 10);
    const yearInt = parseInt(year, 10);
    const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));

    // --- EVALUACIÓN: Verificar Objetivo de Fines de Semana Completos de Descanso ---
    if (service.targetCompleteWeekendsOff && service.targetCompleteWeekendsOff > 0) {
        employeesForService.forEach(emp => {
            let completeWeekendsOffCount = 0;
            for (let dayIter = 1; dayIter <= daysInMonthCount; dayIter++) {
                const date = new Date(yearInt, monthInt - 1, dayIter);
                if (getDay(date) === 6) { // Es Sábado.
                    const saturdayStr = format(date, 'yyyy-MM-dd');
                    const sundayStr = format(addDays(date, 1), 'yyyy-MM-dd');

                    if (addDays(date, 1).getMonth() === monthInt - 1) { // Domingo dentro del mismo mes.
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

            if (completeWeekendsOffCount < service.targetCompleteWeekendsOff) {
                additionalViolations.push({
                    employeeName: emp.name,
                    rule: "Objetivo FDS Descanso No Alcanzado",
                    details: `${emp.name} tuvo ${completeWeekendsOffCount} FDS de descanso completo (Objetivo: ${service.targetCompleteWeekendsOff}).`,
                    severity: 'warning',
                    category: 'employeeWellbeing',
                    shiftType: 'General',
                    date: `${year}-${String(monthInt).padStart(2, '0')}`
                });
                scorePenalty += 1; // Penalización leve.
                scoreBreakdownPenalties.employeeWellbeing += 1;
            }
        });
    }
    // --- FIN DE LA EVALUACIÓN DE FDS COMPLETOS ---

    // Aquí se podrían añadir más reglas de evaluación post-generación en el futuro.

    return { additionalViolations, scorePenalty, scoreBreakdownPenalties };
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
  const generatedShiftsOutput: AIShift[] = []; // Renombrado para evitar conflicto con el parámetro de evaluateGeneratedSchedule
  const violationsOutput: ScheduleViolation[] = []; // Renombrado
  let currentScore = 100; // Puntuación inicial, se decrementa por violaciones.
  let currentScoreBreakdown: ScoreBreakdown = { serviceRules: 100, employeeWellbeing: 100 }; // Desglose de la puntuación.

  const monthInt = parseInt(month, 10);
  const yearInt = parseInt(year, 10);
  const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));
  const firstDayOfCurrentMonth = new Date(yearInt, monthInt - 1, 1);

  // Filtra los empleados que están asignados al servicio actual.
  const employeesForService = allEmployees.filter(emp => emp.serviceIds.includes(service.id));
  if (employeesForService.length === 0) {
    // Si no hay empleados, se genera una violación crítica y se retorna.
    const noEmployeeViolation: ScheduleViolation = { rule: "Sin Empleados", details: `No hay empleados asignados al servicio ${service.name}`, severity: 'error', date: format(firstDayOfCurrentMonth, 'yyyy-MM-dd'), shiftType:'General', category: 'serviceRule' };
    return {
      generatedShifts: [],
      violations: [noEmployeeViolation],
      score: 0,
      scoreBreakdown: { serviceRules: 0, employeeWellbeing: 100 },
      responseText: `No hay empleados asignados al servicio ${service.name}. No se pudo generar el horario.`
    };
  }

  // Inicializa el estado para cada empleado del servicio.
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
        completeWeekendsOffThisMonth: 0, // Inicializado
    };
  });

  // --- PASO PREVIO: Calcular estado inicial de consecutividad basado en el mes anterior ---
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
  // --- FIN DEL PASO PREVIO ---

  // --- BUCLE PRINCIPAL DE GENERACIÓN DIARIA ---
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

    // PASO 0: Procesar Patrones de Trabajo Fijos (L-V Mañana/Tarde)
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
                    if (!canAssignShiftDueToRest(state, shiftCodeToAssign, currentDate)) {
                        violationsOutput.push({
                            employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCodeToAssign,
                            rule: "Patrón Fijo Viola Descanso Mínimo",
                            details: `El patrón fijo de ${emp.name} (${shiftCodeToAssign}) viola la regla de 12h de descanso. Último turno laboral terminó ${state.lastActualWorkShiftEndTime ? format(state.lastActualWorkShiftEndTime, 'Pp', {locale:es}) : 'N/A'}. No se asignó el turno del patrón.`,
                            severity: 'error', category: 'employeeWellbeing'
                        });
                        currentScore -= 10; currentScoreBreakdown.employeeWellbeing -= 10;
                    } else {
                        const { startTime, endTime, notesSuffix } = getShiftDetails(shiftCodeToAssign);
                        generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime, endTime, notes: `Turno Patrón ${notesSuffix}` });
                        dailyAssignedWorkShifts.add(emp.id); state.shiftsThisMonth++;
                        state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                        state.consecutiveRestDays = 0; state.lastShiftType = shiftCodeToAssign;
                        state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, shiftCodeToAssign === 'N');
                        if (shiftCodeToAssign === 'M') staffingNeeds.morning--; else if (shiftCodeToAssign === 'T') staffingNeeds.afternoon--;
                        dailyProcessedEmployees.add(emp.id);
                    }
                }
            } else {
                generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: 'D (Descanso - Patrón Fijo)' });
                state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                state.consecutiveWorkDays = 0; state.lastShiftType = 'D';
                dailyProcessedEmployees.add(emp.id);
            }
        }
    }

    // PASO 1: Procesar Asignaciones Fijas de Ausencia (LAO/LM)
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

    // PASO 2: Procesar Turnos Fijos Semanales (M, T, N, D) para empleados con 'standardRotation'
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
                    generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: shiftNote });
                    dailyProcessedEmployees.add(emp.id);
                    state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                    state.consecutiveWorkDays = 0; state.lastShiftType = lastShiftTypeForState;
                } else if (['mañana', 'tarde', 'noche'].includes(fixedTiming.toLowerCase())) {
                    const shiftCode = fixedTiming.toLowerCase().charAt(0).toUpperCase() as 'M' | 'T' | 'N';

                    if (shiftCode === 'N' && !service.enableNightShift) {
                        violationsOutput.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode, rule: "Error de Configuración de Turno Fijo", details: `Turno fijo 'N' para ${emp.name} pero el servicio no tiene turno noche habilitado. No se asignó.`, severity: 'error', category: 'serviceRule' }); currentScore -= 5; currentScoreBreakdown.serviceRules -= 5;
                        return;
                    }

                    if (!canAssignShiftDueToRest(state, shiftCode, currentDate)) {
                        violationsOutput.push({
                            employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode,
                            rule: "Preferencia Fija Viola Descanso Mínimo",
                            details: `La preferencia de turno fijo para ${emp.name} (${shiftCode} el ${unnormalizedDayOfWeekName}) no se asignó porque viola la regla de 12h de descanso (Turno anterior: ${state.lastShiftType || 'N/A'} finalizó ${state.lastActualWorkShiftEndTime ? format(state.lastActualWorkShiftEndTime, 'Pp', {locale:es}) : 'N/A'}).`,
                            severity: 'error', category: 'employeeWellbeing'
                        });
                        currentScore -= 10; currentScoreBreakdown.employeeWellbeing -= 10;
                        return;
                    }

                    if (isHolidayDay && !isWeekendDay) {
                        generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: `F (Feriado - Cubría ${shiftCode})` });
                        dailyProcessedEmployees.add(emp.id);
                        state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                        state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                    } else {
                        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftCode);
                        const wasRestingFixed = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
                        if (state.consecutiveWorkDays + 1 > maxWorkDays) {
                            violationsOutput.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode, rule: "Violación Consecutividad por Turno Fijo", details: `Turno fijo ${shiftCode} asignado a ${emp.name} causa ${state.consecutiveWorkDays + 1}/${maxWorkDays} días trabajo.`, severity: 'warning', category: 'serviceRule' }); currentScore -= 2; currentScoreBreakdown.serviceRules -= 2;
                        }
                        if (wasRestingFixed && state.consecutiveRestDays < minRestDaysRequired) {
                             violationsOutput.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftCode, rule: "Violación Descanso Mín. por Turno Fijo", details: `Turno fijo ${shiftCode} asignado a ${emp.name} viola mín. días de descanso (${state.consecutiveRestDays}/${minRestDaysRequired}).`, severity: 'warning', category: 'serviceRule' }); currentScore -= 2; currentScoreBreakdown.serviceRules -= 2;
                        }

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

    // PASO 3: Asignar Turnos de Trabajo (M, T, N) Restantes para Cubrir Necesidades
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
        const wasResting = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;

        if (wasResting && state.consecutiveRestDays < preferredRestDays && service.consecutivenessRules?.preferredConsecutiveDaysOff) {
            violationsOutput.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftType, rule: "Bloque de Descanso Preferido Interrumpido", details: `Inicia trabajo con ${state.consecutiveRestDays} días de descanso (preferido: ${preferredRestDays}).`, severity: 'warning', category: 'employeeWellbeing' }); currentScore -= 1; currentScoreBreakdown.employeeWellbeing -=1;
        }
        if (!wasResting && state.consecutiveWorkDays +1 > preferredWorkDays && state.consecutiveWorkDays < maxWorkDays) {
             violationsOutput.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: shiftType, rule: "Bloque de Trabajo Preferido Excedido", details: `Trabajará ${state.consecutiveWorkDays + 1} días (preferido: ${preferredWorkDays}).`, severity: 'warning', category: 'employeeWellbeing' }); currentScore -=1; currentScoreBreakdown.employeeWellbeing -=1;
        }

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

    // PASO 4: Verificar Necesidades de Personal Restantes
    if (staffingNeeds.morning > 0) { violationsOutput.push({ date: currentDateStrYYYYMMDD, shiftType: 'M', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.morning} empleado(s) para Mañana.`, severity: 'error', category: 'serviceRule' }); currentScore -= staffingNeeds.morning * 5; currentScoreBreakdown.serviceRules -= staffingNeeds.morning * 5;}
    if (staffingNeeds.afternoon > 0) { violationsOutput.push({ date: currentDateStrYYYYMMDD, shiftType: 'T', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.afternoon} empleado(s) para Tarde.`, severity: 'error', category: 'serviceRule' }); currentScore -= staffingNeeds.afternoon * 5; currentScoreBreakdown.serviceRules -= staffingNeeds.afternoon * 5;}
    if (service.enableNightShift && staffingNeeds.night > 0) { violationsOutput.push({ date: currentDateStrYYYYMMDD, shiftType: 'N', rule: "Falta de Personal", details: `Faltan ${staffingNeeds.night} empleado(s) para Noche.`, severity: 'error', category: 'serviceRule' }); currentScore -= staffingNeeds.night * 5; currentScoreBreakdown.serviceRules -= staffingNeeds.night * 5;}

    // PASO 5: Salvaguarda para Empleados No Procesados
    employeesForService.forEach(emp => {
        if (!dailyProcessedEmployees.has(emp.id)) {
            const preferences = emp.preferences;
            const workPattern = preferences?.workPattern;
            const isCurrentDayAWeekday = !isWeekendDay;

            if ((workPattern === 'mondayToFridayMorning' || workPattern === 'mondayToFridayAfternoon') && isCurrentDayAWeekday && !isHolidayDay) {
                 violationsOutput.push({
                    employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General',
                    rule: "Error Interno del Algoritmo",
                    details: `El empleado ${emp.name} tiene un patrón de trabajo fijo L-V (${workPattern}) para hoy pero no fue procesado (posiblemente por violar regla de 12h). Se evita asignación de descanso. Revise la lógica.`,
                    severity: 'error', category: 'serviceRule'
                });
                currentScore -= 20; currentScoreBreakdown.serviceRules -= 20; dailyProcessedEmployees.add(emp.id); return;
            }

            if ((!workPattern || workPattern === 'standardRotation') && preferences?.fixedWeeklyShiftDays && preferences.fixedWeeklyShiftDays.includes(currentDayOfWeekName)) {
                const fixedTiming = preferences.fixedWeeklyShiftTiming;
                if (fixedTiming && fixedTiming !== NO_FIXED_TIMING_VALUE && fixedTiming !== REST_DAY_VALUE && fixedTiming.toUpperCase() !== 'D') {
                    const isFixedWorkShiftOnHolidayThatWasHandledAsF = isHolidayDay && !isWeekendDay && (['mañana', 'tarde', 'noche'].includes(fixedTiming.toLowerCase()));
                    if (!isFixedWorkShiftOnHolidayThatWasHandledAsF) {
                        violationsOutput.push({
                            employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General',
                            rule: "Error Interno del Algoritmo",
                            details: `El empleado ${emp.name} tiene un turno de trabajo fijo (${fixedTiming}) para hoy (${currentDayOfWeekName}) pero no fue procesado (posiblemente por violar regla de 12h). Se evita asignación de descanso. Revise sus preferencias y la lógica.`,
                            severity: 'error', category: 'serviceRule'
                        });
                        currentScore -= 20; currentScoreBreakdown.serviceRules -= 20; dailyProcessedEmployees.add(emp.id);
                    }
                }
            }
        }
    });

    // PASO 6: Asignar Descansos ('D' o 'F') a Empleados Restantes
    employeesForService.forEach(emp => {
      const state = employeeStates[emp.id];
      if (!dailyProcessedEmployees.has(emp.id)) {
        const maxRestDays = service.consecutivenessRules?.maxConsecutiveDaysOff || 7;
        const preferredWorkDays = service.consecutivenessRules?.preferredConsecutiveWorkDays || (service.consecutivenessRules?.maxConsecutiveWorkDays || 7);
        const isLastShiftWorkType = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N');

        if (isLastShiftWorkType && state.consecutiveWorkDays < preferredWorkDays) {
            violationsOutput.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General', rule: "Bloque de Trabajo Preferido Interrumpido", details: `Descansa después de ${state.consecutiveWorkDays} días de trabajo (preferido: ${preferredWorkDays}).`, severity: 'warning', category: 'employeeWellbeing' }); currentScore -= 1; currentScoreBreakdown.employeeWellbeing -=1;
        }

        const isLastShiftRestType = state.lastShiftType === 'D' || state.lastShiftType === 'F' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined;
        if (isLastShiftRestType && state.consecutiveRestDays >= maxRestDays) {
             violationsOutput.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: 'General', rule: "Exceso Descansos Consecutivos (Forzado a Trabajo)", details: `Excedió máx. descansos (${state.consecutiveRestDays}/${maxRestDays}), pero no se pudo asignar trabajo. Se asigna descanso/feriado.`, severity: 'warning', category: 'serviceRule' }); currentScore -= 1; currentScoreBreakdown.serviceRules -= 1;
        }

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
            }
        }

        generatedShiftsOutput.push({ date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name, startTime: '', endTime: '', notes: shiftNote });
        dailyProcessedEmployees.add(emp.id);

        state.consecutiveRestDays = isLastShiftRestType ? state.consecutiveRestDays + 1 : 1;
        state.consecutiveWorkDays = 0;
        state.lastShiftType = lastShiftTypeForState;
      } else if (dailyAssignedWorkShifts.has(emp.id)) {
        const maxWork = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
        if (state.consecutiveWorkDays > maxWork) {
            violationsOutput.push({ employeeName: emp.name, date: currentDateStrYYYYMMDD, shiftType: state.lastShiftType as 'M'|'T'|'N' || 'General', rule: "Exceso Días Trabajo Consecutivos", details: `Trabajó ${state.consecutiveWorkDays} días (máx: ${maxWork}).`, severity: 'error', category: 'serviceRule' }); currentScore -= 10; currentScoreBreakdown.serviceRules -= 10;
        }
      }
    });
  } // --- FIN DEL BUCLE PRINCIPAL DE GENERACIÓN DIARIA ---

  // --- EVALUACIÓN FINAL POST-GENERACIÓN ---
  const evaluationResult = evaluateGeneratedSchedule(
    generatedShiftsOutput,
    service,
    month,
    year,
    employeesForService,
    holidays
  );

  violationsOutput.push(...evaluationResult.additionalViolations);
  currentScore -= evaluationResult.scorePenalty;
  currentScoreBreakdown.serviceRules -= evaluationResult.scoreBreakdownPenalties.serviceRules;
  currentScoreBreakdown.employeeWellbeing -= evaluationResult.scoreBreakdownPenalties.employeeWellbeing;
  // --- FIN DE LA EVALUACIÓN FINAL ---

  const monthName = format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es });
  const finalScore = Math.max(0, Math.min(100, currentScore));
  currentScoreBreakdown.serviceRules = Math.max(0, Math.min(100, currentScoreBreakdown.serviceRules));
  currentScoreBreakdown.employeeWellbeing = Math.max(0, Math.min(100, currentScoreBreakdown.employeeWellbeing));

  const errorCount = violationsOutput.filter(v => v.severity === 'error').length;
  const warningCount = violationsOutput.filter(v => v.severity === 'warning').length;
  let responseSummary = `Horario generado algorítmicamente para ${service.name} (${monthName}). Puntuación General: ${finalScore.toFixed(0)}/100.`;
  responseSummary += ` [Reglas Servicio: ${currentScoreBreakdown.serviceRules.toFixed(0)}/100, Bienestar Personal: ${currentScoreBreakdown.employeeWellbeing.toFixed(0)}/100].`;
  if (errorCount > 0) responseSummary += ` Errores Críticos: ${errorCount}.`;
  if (warningCount > 0) responseSummary += ` Advertencias: ${warningCount}.`;
  if (errorCount === 0 && warningCount === 0) responseSummary += " ¡Sin errores ni advertencias notables!";

  return { generatedShifts: generatedShiftsOutput, responseText: responseSummary, violations: violationsOutput, score: finalScore, scoreBreakdown: currentScoreBreakdown };
}
