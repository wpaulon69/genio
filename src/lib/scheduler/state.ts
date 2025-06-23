/**
 * @fileOverview Define las interfaces de estado y la lógica de inicialización para el algoritmo de generación de horarios.
 */

import type { Employee, AIShift, ScoreBreakdown, ScheduleViolation } from '@/lib/types';
import { format, parseISO, subDays } from 'date-fns';
import { getShiftTypeForEval, getShiftDetails, getShiftDateTime } from './utils';
import type { ScheduleRulesConfig } from './config';

/**
 * Mantiene el estado de un empleado durante el proceso de generación o evaluación del horario.
 */
export interface EmployeeState {
  id: number;
  name: string;
  consecutiveWorkDays: number;
  consecutiveRestDays: number;
  shiftsThisMonth: number;
  lastShiftType?: AIShift['notes'] | 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F';
  lastActualWorkShiftEndTime: Date | null;
  completeWeekendsOffThisMonth: number;
}

/**
 * Contiene los resultados acumulados durante la evaluación de un horario.
 */
export interface EvaluationContext {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  violations: ScheduleViolation[];
}

/**
 * Inicializa el estado de los empleados basándose en los turnos del mes anterior.
 */
export function initializeEmployeeStatesFromHistory(
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
      const shiftToday = sortedPreviousShifts.find(s => s.date === dateToCheckStr && s.employeeName === emp.nombre);

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
    employeeStates[emp.id_empleado] = {
      id: emp.id_empleado,
      name: emp.nombre,
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
