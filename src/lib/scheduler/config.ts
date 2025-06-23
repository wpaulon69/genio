/**
 * @fileOverview Define la configuración y las penalizaciones para el algoritmo de generación de horarios.
 */

/**
 * Define las penalizaciones de puntuación para diferentes tipos de violaciones de reglas.
 */
export interface ScorePenalties {
  minRestBetweenShiftsViolation: number;
  maxConsecutiveWorkDaysViolation: number;
  minRestBeforeWorkViolation: number;
  maxConsecutiveDaysOffViolation: number;
  staffingShortagePerEmployee: number;
  weekendTargetNotMetPerWeekend: number;
  maxWeekendTargetPenalty: number;
}

/**
 * Configuración de reglas para el algoritmo de generación y evaluación de horarios.
 */
export interface ScheduleRulesConfig {
  minimumRestHoursBetweenShifts: number;
  maxConsecutiveWorkDays: number;
  preferredConsecutiveWorkDays: number;
  maxConsecutiveDaysOff: number;
  preferredConsecutiveDaysOff: number;
  minConsecutiveDaysOffRequiredBeforeWork: number;
  defaultTargetCompleteWeekendsOff: number;
  scorePenalties: ScorePenalties;
}

/**
 * Configuración por defecto para las reglas del horario.
 */
export const defaultScheduleRulesConfig: ScheduleRulesConfig = {
  minimumRestHoursBetweenShifts: 12,
  maxConsecutiveWorkDays: 7,
  preferredConsecutiveWorkDays: 5,
  maxConsecutiveDaysOff: 4,
  preferredConsecutiveDaysOff: 2,
  minConsecutiveDaysOffRequiredBeforeWork: 1,
  defaultTargetCompleteWeekendsOff: 1,
  scorePenalties: {
    minRestBetweenShiftsViolation: 10,
    minRestBeforeWorkViolation: 5,
    maxConsecutiveWorkDaysViolation: 5,
    maxConsecutiveDaysOffViolation: 1,
    staffingShortagePerEmployee: 5,
    weekendTargetNotMetPerWeekend: 2,
    maxWeekendTargetPenalty: 10,
  },
};
