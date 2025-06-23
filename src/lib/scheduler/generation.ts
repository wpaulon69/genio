/**
 * @fileOverview Contiene la lógica principal de generación de horarios.
 */

import type { Service, Employee, Holiday, AIShift, ScoreBreakdown, ScheduleViolation } from '@/lib/types';
import { format, getDaysInMonth, getDay, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { EmployeeState } from './state';
import { defaultScheduleRulesConfig, type ScheduleRulesConfig } from './config';
import { initializeEmployeeStatesFromHistory } from './state';
import { isEmployeeOnFixedAssignmentOnDate, getShiftDetails, canAssignShiftDueToRest, getShiftDateTime, normalizeDayName, getShiftTypeForEval, isRestDay } from './utils';
import { evaluateScheduleMetrics } from './evaluation';

const NO_FIXED_TIMING_VALUE = "none_selected";
const REST_DAY_VALUE = "rest_day";

export async function generateAlgorithmicSchedule(
  service: Service,
  month: string,
  year: string,
  allEmployees: Employee[],
  holidays: Holiday[],
  previousMonthShifts: AIShift[] | null,
  rulesConfig: ScheduleRulesConfig = defaultScheduleRulesConfig
): Promise<{ generatedShifts: AIShift[]; responseText: string; violations: ScheduleViolation[]; score: number; scoreBreakdown: ScoreBreakdown; }> {
  
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

  const employeesForService = allEmployees.filter(emp => emp.id_servicio === service.id_servicio);
  if (employeesForService.length === 0) {
    const noEmployeeViolation: ScheduleViolation = { rule: "Sin Empleados", details: `No hay empleados asignados al servicio ${service.nombre_servicio}`, severity: 'error', date: format(firstDayOfCurrentMonth, 'yyyy-MM-dd'), shiftType:'General', category: 'serviceRule' };
    return {
      generatedShifts: [],
      violations: [noEmployeeViolation],
      score: 0,
      scoreBreakdown: { serviceRules: 0, employeeWellbeing: 100 },
      responseText: `No hay empleados asignados al servicio ${service.nombre_servicio}. No se pudo generar el horario.`
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
      const currentDayOfWeekName = normalizeDayName(currentDayOfWeekNum); 
      const isWeekendDay = currentDayOfWeekNum === 0 || currentDayOfWeekNum === 6;
      const isHolidayDay = holidays.some(h => h.date === currentDateStrYYYYMMDD);
      const useWeekendHolidayStaffing = isWeekendDay || isHolidayDay;

      let staffingNeeds = {
        morning: useWeekendHolidayStaffing ? service.dotacion_objetivo_sab_dom_feriados_mananas : service.dotacion_objetivo_lunes_a_viernes_mananas,
        afternoon: useWeekendHolidayStaffing ? service.dotacion_objetivo_sab_dom_feriados_tardes : service.dotacion_objetivo_lunes_a_viernes_tardes,
        night: (service.habilitar_turno_noche && useWeekendHolidayStaffing) ? service.dotacion_objetivo_sab_dom_feriados_noche : (service.habilitar_turno_noche ? service.dotacion_objetivo_lunes_a_viernes_noche : 0),
      };
      const dailyAssignedWorkShifts = new Set<string>(); 
      const dailyProcessedEmployees = new Set<string>(); 

      for (const emp of employeesForService) {
          const state = employeeStates[emp.id_empleado];
          const workPattern = emp.tipo_patron_trabajo;
          const isCurrentDayAWeekday = !isWeekendDay;

          if (workPattern === 'mondayToFridayMorning' || workPattern === 'mondayToFridayAfternoon') {
              const shiftCodeToAssign: 'M' | 'T' = workPattern === 'mondayToFridayMorning' ? 'M' : 'T';
              if (isCurrentDayAWeekday) { 
                  if (isHolidayDay) { 
                      currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.nombre, serviceName: service.nombre_servicio, startTime: '', endTime: '', notes: 'F (Feriado - Patrón Fijo)' });
                      state.consecutiveRestDays = isRestDay(state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
                      state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                  } else { 
                       if (canAssignShiftDueToRest(state.lastActualWorkShiftEndTime, getShiftDateTime(currentDate, getShiftDetails(shiftCodeToAssign).startTime), rulesConfig.minimumRestHoursBetweenShifts)) {
                          const { startTime, endTime } = getShiftDetails(shiftCodeToAssign);
                          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.nombre, serviceName: service.nombre_servicio, startTime, endTime, notes: `Turno Patrón` });
                          dailyAssignedWorkShifts.add(emp.id_empleado.toString()); state.shiftsThisMonth++;
                          const wasWorkingPreviously = state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N';
                          state.consecutiveWorkDays = wasWorkingPreviously ? state.consecutiveWorkDays + 1 : 1;
                          state.consecutiveRestDays = 0; state.lastShiftType = shiftCodeToAssign;
                          state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, false); // 'N' is not possible here
                          if (shiftCodeToAssign === 'M') staffingNeeds.morning = Math.max(0, staffingNeeds.morning - 1);
                          else if (shiftCodeToAssign === 'T') staffingNeeds.afternoon = Math.max(0, staffingNeeds.afternoon - 1);
                      }
                  }
              } else { 
                  currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.nombre, serviceName: service.nombre_servicio, startTime: '', endTime: '', notes: 'D (Descanso - Patrón Fijo)' });
                  state.consecutiveRestDays = isRestDay(state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
                  state.consecutiveWorkDays = 0; state.lastShiftType = 'D';
              }
              dailyProcessedEmployees.add(emp.id_empleado.toString());
          }
      }
      
      employeesForService.forEach(emp => {
        if (dailyProcessedEmployees.has(emp.id_empleado.toString())) return; 
        const state = employeeStates[emp.id_empleado.toString()];
        const fixedAssignment = isEmployeeOnFixedAssignmentOnDate(currentDate, emp.asignaciones ?? []);
        if (fixedAssignment && fixedAssignment.tipo_asignacion && (fixedAssignment.tipo_asignacion.nombre_tipo === 'LAO' || fixedAssignment.tipo_asignacion.nombre_tipo === 'LM')) {
          const assignmentType = fixedAssignment.tipo_asignacion.nombre_tipo;
          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.nombre, serviceName: service.nombre_servicio, startTime: '', endTime: '', notes: `${assignmentType}${fixedAssignment.descripcion ? ` - ${fixedAssignment.descripcion}` : ''}` });
          dailyProcessedEmployees.add(emp.id_empleado.toString());
          state.consecutiveRestDays = isRestDay(state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
          state.consecutiveWorkDays = 0; state.lastShiftType = assignmentType;
        }
      });

      employeesForService.forEach(emp => {
          if (dailyProcessedEmployees.has(emp.id_empleado.toString())) return;
          const workPattern = emp.tipo_patron_trabajo;
          if (workPattern && workPattern !== 'standardRotation') return;
          const state = employeeStates[emp.id_empleado.toString()];
          const fixedShifts = emp.turnos_fijos;
          const fixedShiftForDay = fixedShifts?.find(fs => fs.dia_semana === currentDayOfWeekName);

          if (fixedShiftForDay) {
              const fixedTiming = fixedShiftForDay.tipo_turno;
              if (fixedTiming) {
                  if (fixedTiming === 'Descanso') {
                      const shiftNote = isHolidayDay ? 'F (Feriado - Descanso Fijo)' : 'D (Fijo Semanal)';
                      const lastShiftTypeForState: EmployeeState['lastShiftType'] = isHolidayDay ? 'F' : 'D';
                      currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.nombre, serviceName: service.nombre_servicio, startTime: '', endTime: '', notes: shiftNote });
                      dailyProcessedEmployees.add(emp.id_empleado.toString());
                      state.consecutiveRestDays = isRestDay(state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
                      state.consecutiveWorkDays = 0; state.lastShiftType = lastShiftTypeForState;
                  } else if (['Mañana', 'Tarde', 'Noche'].includes(fixedTiming)) {
                      const shiftCode = fixedTiming.charAt(0).toUpperCase() as 'M' | 'T' | 'N';
                      if (shiftCode === 'N' && !service.habilitar_turno_noche) return; 
                      if (!canAssignShiftDueToRest(state.lastActualWorkShiftEndTime, getShiftDateTime(currentDate, getShiftDetails(shiftCode).startTime), rulesConfig.minimumRestHoursBetweenShifts)) return;
                      if (isHolidayDay && !isWeekendDay) { 
                          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.nombre, serviceName: service.nombre_servicio, startTime: '', endTime: '', notes: `F (Feriado - Cubría ${shiftCode})` });
                          dailyProcessedEmployees.add(emp.id_empleado.toString());
                          state.consecutiveRestDays = isRestDay(state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
                          state.consecutiveWorkDays = 0; state.lastShiftType = 'F';
                      } else { 
                          const {startTime, endTime} = getShiftDetails(shiftCode);
                          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.nombre, serviceName: service.nombre_servicio, startTime, endTime, notes: `Turno Fijo` });
                          dailyAssignedWorkShifts.add(emp.id_empleado.toString()); dailyProcessedEmployees.add(emp.id_empleado.toString()); state.shiftsThisMonth++;
                          const wasWorkingPreviously = state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N';
                          state.consecutiveWorkDays = wasWorkingPreviously ? state.consecutiveWorkDays + 1 : 1;
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
        let needed = getNeeded(); 
        if (needed <= 0) return;
        const {startTime, endTime} = getShiftDetails(shiftType);
        const maxWorkDays = rulesConfig.maxConsecutiveWorkDays;
        const minRestDaysRequired = rulesConfig.minConsecutiveDaysOffRequiredBeforeWork;
        
        const initialPool = employeesForService.filter(emp => !dailyProcessedEmployees.has(emp.id_empleado.toString()) && !dailyAssignedWorkShifts.has(emp.id_empleado.toString()));

        const availableForWork = initialPool
          .filter(emp => { 
              const state = employeeStates[emp.id_empleado.toString()];
              const currentShiftStartTime = getShiftDateTime(currentDate, startTime);
              const canWork = canAssignShiftDueToRest(state.lastActualWorkShiftEndTime, currentShiftStartTime, rulesConfig.minimumRestHoursBetweenShifts);
              const wasResting = isRestDay(state.lastShiftType);
              const hasEnoughMinRest = wasResting ? state.consecutiveRestDays >= minRestDaysRequired : true;
              const notExceedingMaxWork = state.consecutiveWorkDays < maxWorkDays;
              
              return canWork && hasEnoughMinRest && notExceedingMaxWork;
          })
          .sort((a, b) => { 
              const stateA = employeeStates[a.id_empleado.toString()]; const stateB = employeeStates[b.id_empleado.toString()];
              const aWasResting = isRestDay(stateA.lastShiftType);
              const bWasResting = isRestDay(stateB.lastShiftType);
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
              
              const targetWeekends = service.fds_descanso_completo_objetivo ?? rulesConfig.defaultTargetCompleteWeekendsOff;
              if (useWeekendHolidayStaffing && targetWeekends && targetWeekends > 0) {
                  const aPrefersWeekend = a.prefiere_trabajar_fines_semana ?? false;
                  const bPrefersWeekend = b.prefiere_trabajar_fines_semana ?? false;
                  if (aPrefersWeekend && !bPrefersWeekend) return -1; 
                  if (!aPrefersWeekend && bPrefersWeekend) return 1;  
              }

              if (stateA.shiftsThisMonth !== stateB.shiftsThisMonth) return stateA.shiftsThisMonth - stateB.shiftsThisMonth;
              if (useWeekendHolidayStaffing) {
                  const prefersA = a.prefiere_trabajar_fines_semana ?? false;
                  const prefersB = b.prefiere_trabajar_fines_semana ?? false;
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
          const state = employeeStates[emp.id_empleado.toString()];
          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.nombre, serviceName: service.nombre_servicio, startTime: startTime, endTime: endTime, notes: `${notesDetail}` });
          dailyAssignedWorkShifts.add(emp.id_empleado.toString()); dailyProcessedEmployees.add(emp.id_empleado.toString()); state.shiftsThisMonth++;
          const wasWorkingPreviously = state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N';
          state.consecutiveWorkDays = wasWorkingPreviously ? state.consecutiveWorkDays + 1 : 1;
          state.consecutiveRestDays = 0; state.lastShiftType = shiftType;
          state.lastActualWorkShiftEndTime = getShiftDateTime(currentDate, endTime, shiftType === 'N');
          decrementNeeded(); needed = getNeeded();
        }
      };

      assignShiftsForType('M', () => staffingNeeds.morning, () => staffingNeeds.morning = Math.max(0, staffingNeeds.morning - 1), "Turno Mañana");
      assignShiftsForType('T', () => staffingNeeds.afternoon, () => staffingNeeds.afternoon = Math.max(0, staffingNeeds.afternoon - 1), "Turno Tarde");
      if (service.habilitar_turno_noche) assignShiftsForType('N', () => staffingNeeds.night, () => staffingNeeds.night = Math.max(0, staffingNeeds.night - 1), "Turno Noche");

      employeesForService.forEach(emp => {
        const state = employeeStates[emp.id_empleado.toString()];
        if (!dailyProcessedEmployees.has(emp.id_empleado.toString())) { 
          let shiftNote = isHolidayDay ? 'F (Feriado)' : 'D (Descanso)';
          const lastShiftTypeForState: EmployeeState['lastShiftType'] = isHolidayDay ? 'F' : 'D';
          const targetWeekends = service.fds_descanso_completo_objetivo ?? rulesConfig.defaultTargetCompleteWeekendsOff;
          if ((currentDayOfWeekNum === 0 || currentDayOfWeekNum === 6) && targetWeekends && targetWeekends > 0) {
              let isOtherWeekendDayOff = false;
              const otherWeekendDayDate = (currentDayOfWeekNum === 6) ? addDays(currentDate, 1) : subDays(currentDate, 1);
              if (otherWeekendDayDate.getMonth() === monthInt - 1) { 
                  const otherWeekendDayStr = format(otherWeekendDayDate, 'yyyy-MM-dd');
                  const otherDayShift = currentGeneratedShifts.find(s => s.employeeName === emp.nombre && s.date === otherWeekendDayStr);
                  if (!otherDayShift) { 
                      isOtherWeekendDayOff = true;
                  } else {
                      const otherShiftType = getShiftTypeForEval(otherDayShift);
                      isOtherWeekendDayOff = isRestDay(otherShiftType);
                  }
              }
              if (isOtherWeekendDayOff) { 
                  shiftNote = isHolidayDay ? 'F (FDS Objetivo - Feriado)' : 'D (FDS Objetivo)';
              }
          }

          currentGeneratedShifts.push({ date: currentDateStrYYYYMMDD, employeeName: emp.nombre, serviceName: service.nombre_servicio, startTime: '', endTime: '', notes: shiftNote });
          dailyProcessedEmployees.add(emp.id_empleado.toString());
          state.consecutiveRestDays = isRestDay(state.lastShiftType) ? state.consecutiveRestDays + 1 : 1;
          state.consecutiveWorkDays = 0; state.lastShiftType = lastShiftTypeForState;
        }
      });
    } 

    const { score, violations, scoreBreakdown, responseText } = await evaluateScheduleMetrics(
      currentGeneratedShifts,
      service,
      month,
      year,
      allEmployees,
      holidays,
      previousMonthShifts,
      rulesConfig 
    );

    if (attemptsMade === 1 || score > bestScore) {
      bestScore = score;
      bestScheduleShifts = [...currentGeneratedShifts];
      bestViolations = [...violations];
      bestScoreBreakdown = { ...scoreBreakdown };
      bestResponseText = responseText;
    }
    
  } 

  if (bestScore === -1 && attemptsMade > 0) { 
    bestResponseText = "El algoritmo no pudo generar un horario inicial. Revise la configuración del servicio y los empleados.";
  } else if (attemptsMade === maxAttempts && bestScore < targetScore) {
    bestResponseText += ` (Se alcanzó el máximo de ${maxAttempts} intentos sin superar el objetivo de ${targetScore} puntos.)`;
  }

  return {
    generatedShifts: bestScheduleShifts,
    responseText: bestResponseText,
    violations: bestViolations,
    score: bestScore === -1 ? 0 : bestScore,
    scoreBreakdown: bestScoreBreakdown,
  };
}
