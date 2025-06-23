/**
 * @fileOverview Contiene la lógica de evaluación de horarios.
 */

import type { Service, Employee, Holiday, AIShift, ScoreBreakdown, ScheduleViolation } from '@/lib/types';
import { format, getDaysInMonth, getDay, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ScheduleRulesConfig } from './config';
import type { EvaluationContext } from './state';
import { getShiftTypeForEval, getShiftDetails, getShiftDateTime, isRestDay } from './utils';
import { initializeEmployeeStatesFromHistory } from './state';
import { canAssignShiftDueToRest } from './utils';

function evaluateWeekendTargetCompliance(
    shiftsToEvaluate: AIShift[],
    service: Service,
    monthStr: string,
    yearStr: string,
    employeesForService: Employee[],
    evalCtx: EvaluationContext,
    rulesConfig: ScheduleRulesConfig
): void {
    const targetWeekends = service.fds_descanso_completo_objetivo ?? rulesConfig.defaultTargetCompleteWeekendsOff;
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
                    const saturdayShift = shiftsToEvaluate.find(s => s.employeeName === emp.nombre && s.date === saturdayStr);
                    const sundayShift = shiftsToEvaluate.find(s => s.employeeName === emp.nombre && s.date === sundayStr);
                    const satShiftType = saturdayShift ? getShiftTypeForEval(saturdayShift) : 'D';
                    const sunShiftType = sundayShift ? getShiftTypeForEval(sundayShift) : 'D';
                    if (isRestDay(satShiftType) && isRestDay(sunShiftType)) {
                        completeWeekendsOffCount++;
                    }
                }
            }
        }

        if (completeWeekendsOffCount < targetWeekends) {
            const penaltyValue = (targetWeekends - completeWeekendsOffCount) * rulesConfig.scorePenalties.weekendTargetNotMetPerWeekend;
            const cappedPenalty = Math.min(rulesConfig.scorePenalties.maxWeekendTargetPenalty, penaltyValue);
            evalCtx.violations.push({
                employeeName: emp.nombre,
                rule: "Objetivo FDS Descanso No Alcanzado",
                details: `${emp.nombre} tuvo ${completeWeekendsOffCount} FDS de descanso completo (Objetivo: ${targetWeekends}).`,
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

export async function evaluateScheduleMetrics(
  shiftsToEvaluate: AIShift[],
  service: Service,
  monthStr: string,
  yearStr: string,
  allEmployees: Employee[],
  allHolidays: Holiday[],
  previousMonthShifts: AIShift[] | null,
  rulesConfig: ScheduleRulesConfig
): Promise<{ score: number; violations: ScheduleViolation[]; scoreBreakdown: ScoreBreakdown; responseText: string; }> {
    const evalCtx: EvaluationContext = {
        score: 100,
        scoreBreakdown: { serviceRules: 100, employeeWellbeing: 100 },
        violations: [],
    };

    const monthInt = parseInt(monthStr, 10);
    const yearInt = parseInt(yearStr, 10);
    const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));
    const firstDayOfCurrentMonth = new Date(yearInt, monthInt - 1, 1);

    const employeesForService = allEmployees.filter(emp => emp.id_servicio === service.id_servicio);
    if (employeesForService.length === 0) {
        evalCtx.violations.push({ rule: "Sin Empleados", details: `No hay empleados asignados al servicio ${service.nombre_servicio}`, severity: 'error', date: format(firstDayOfCurrentMonth, 'yyyy-MM-dd'), shiftType:'General', category: 'serviceRule' });
        evalCtx.score = 0; evalCtx.scoreBreakdown.serviceRules = 0;
        return { responseText: "Error: Sin empleados en el servicio.", ...evalCtx };
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
            const state = employeeStates[emp.id_empleado.toString()];
            const shiftForEmployeeToday = shiftsToEvaluate.find(s => s.employeeName === emp.nombre && s.date === currentDateStrYYYYMMDD);
            
            const shiftType = shiftForEmployeeToday ? getShiftTypeForEval(shiftForEmployeeToday) : 'D'; 

            if (shiftType === 'M' || shiftType === 'T' || shiftType === 'N') {
                state.shiftsThisMonth++;
                dailyStaffing[shiftType]++;

                const { startTime: currentShiftStartTimeStr } = getShiftDetails(shiftType);
                const currentShiftStartTime = getShiftDateTime(currentDate, currentShiftStartTimeStr);
                if (!canAssignShiftDueToRest(state.lastActualWorkShiftEndTime, currentShiftStartTime, rulesConfig.minimumRestHoursBetweenShifts)) {
                    evalCtx.violations.push({ employeeName: emp.nombre, date: currentDateStrYYYYMMDD, shiftType, rule: "Violación Descanso Mínimo entre Turnos", details: `No se respetaron las ${rulesConfig.minimumRestHoursBetweenShifts}h de descanso. Último turno laboral terminó ${state.lastActualWorkShiftEndTime ? format(state.lastActualWorkShiftEndTime, 'Pp', {locale:es}) : 'N/A'}.`, severity: 'error', category: 'employeeWellbeing' });
                    evalCtx.score -= rulesConfig.scorePenalties.minRestBetweenShiftsViolation; evalCtx.scoreBreakdown.employeeWellbeing -= rulesConfig.scorePenalties.minRestBetweenShiftsViolation;
                }

                const wasResting = isRestDay(state.lastShiftType);
                if (wasResting && state.consecutiveRestDays < rulesConfig.minConsecutiveDaysOffRequiredBeforeWork) {
                    evalCtx.violations.push({ employeeName: emp.nombre, date: currentDateStrYYYYMMDD, shiftType, rule: "Violación Mínimo Descanso Antes de Trabajar", details: `Comienza trabajo con ${state.consecutiveRestDays} día(s) de descanso (requerido: ${rulesConfig.minConsecutiveDaysOffRequiredBeforeWork}).`, severity: 'error', category: 'serviceRule' });
                    evalCtx.score -= rulesConfig.scorePenalties.minRestBeforeWorkViolation; evalCtx.scoreBreakdown.serviceRules -= rulesConfig.scorePenalties.minRestBeforeWorkViolation;
                }

                state.consecutiveWorkDays = wasResting ? 1 : state.consecutiveWorkDays + 1;
                state.consecutiveRestDays = 0;
                state.lastShiftType = shiftType;
                const { endTime: shiftEndTimeStr } = getShiftDetails(shiftType);
                state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, shiftEndTimeStr, shiftType === 'N');

                if (state.consecutiveWorkDays > rulesConfig.maxConsecutiveWorkDays) {
                    evalCtx.violations.push({ employeeName: emp.nombre, date: currentDateStrYYYYMMDD, shiftType, rule: "Exceso Días Trabajo Consecutivos", details: `Trabajó ${state.consecutiveWorkDays} días (máx: ${rulesConfig.maxConsecutiveWorkDays}).`, severity: 'error', category: 'serviceRule' });
                    evalCtx.score -= rulesConfig.scorePenalties.maxConsecutiveWorkDaysViolation; evalCtx.scoreBreakdown.serviceRules -= rulesConfig.scorePenalties.maxConsecutiveWorkDaysViolation;
                }

            } else { 
                state.consecutiveRestDays = isRestDay(state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
                state.consecutiveWorkDays = 0;
                state.lastShiftType = shiftType || 'D'; 

                if (state.consecutiveRestDays > rulesConfig.maxConsecutiveDaysOff) {
                    evalCtx.violations.push({ employeeName: emp.nombre, date: currentDateStrYYYYMMDD, shiftType: 'General', rule: "Exceso Días Descanso Consecutivos", details: `Descansó ${state.consecutiveRestDays} días (máx: ${rulesConfig.maxConsecutiveDaysOff}).`, severity: 'warning', category: 'employeeWellbeing' });
                    evalCtx.score -= rulesConfig.scorePenalties.maxConsecutiveDaysOffViolation; evalCtx.scoreBreakdown.employeeWellbeing -= rulesConfig.scorePenalties.maxConsecutiveDaysOffViolation;
                }
            }
        }

        const staffingNeedsConfig = {
            morning: useWeekendHolidayStaffing ? service.dotacion_objetivo_sab_dom_feriados_mananas : service.dotacion_objetivo_lunes_a_viernes_mananas,
            afternoon: useWeekendHolidayStaffing ? service.dotacion_objetivo_sab_dom_feriados_tardes : service.dotacion_objetivo_lunes_a_viernes_tardes,
            night: (service.habilitar_turno_noche && useWeekendHolidayStaffing) ? service.dotacion_objetivo_sab_dom_feriados_noche : (service.habilitar_turno_noche ? service.dotacion_objetivo_lunes_a_viernes_noche : 0),
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
        if (service.habilitar_turno_noche && dailyStaffing.N < staffingNeedsConfig.night) {
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
    let responseSummary = `Evaluación del horario para ${service.nombre_servicio} (${monthName}). Puntuación General: ${finalScore.toFixed(0)}/100.`;
    responseSummary += ` [Reglas Servicio: ${evalCtx.scoreBreakdown.serviceRules.toFixed(0)}/100, Bienestar Personal: ${evalCtx.scoreBreakdown.employeeWellbeing.toFixed(0)}/100].`;
    if (errorCount > 0) responseSummary += ` Errores Críticos: ${errorCount}.`;
    if (warningCount > 0) responseSummary += ` Advertencias: ${warningCount}.`;
    if (errorCount === 0 && warningCount === 0) responseSummary += " ¡Sin errores ni advertencias notables!";

    return {
        responseText: responseSummary,
        score: finalScore,
        violations: evalCtx.violations,
        scoreBreakdown: evalCtx.scoreBreakdown,
    };
}
