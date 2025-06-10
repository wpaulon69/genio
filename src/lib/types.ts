
/**
 * @fileOverview Define todas las interfaces y tipos de datos TypeScript utilizados en la aplicación ShiftFlow.
 * Estos tipos estructuran la información para servicios, empleados, horarios, feriados, y otros
 * elementos clave del sistema de planificación de turnos.
 */

/**
 * Define las necesidades de personal para diferentes turnos y tipos de día (laborable vs. fin de semana/feriado).
 */
export interface StaffingNeeds {
  /** Número de empleados necesarios en turno mañana en días laborables. */
  morningWeekday: number;
  /** Número de empleados necesarios en turno tarde en días laborables. */
  afternoonWeekday: number;
  /** Número de empleados necesarios en turno noche en días laborables. */
  nightWeekday: number;
  /** Número de empleados necesarios en turno mañana en fines de semana o feriados. */
  morningWeekendHoliday: number;
  /** Número de empleados necesarios en turno tarde en fines de semana o feriados. */
  afternoonWeekendHoliday: number;
  /** Número de empleados necesarios en turno noche en fines de semana o feriados. */
  nightWeekendHoliday: number;
}

/**
 * Define las reglas sobre la consecutividad de días de trabajo y días de descanso para un servicio.
 */
export interface ConsecutivenessRules {
  /** Máximo número de días de trabajo consecutivos permitidos. */
  maxConsecutiveWorkDays: number;
  /** Número preferido de días de trabajo consecutivos (para optimización del horario). */
  preferredConsecutiveWorkDays: number;
  /** Máximo número de días de descanso consecutivos permitidos. */
  maxConsecutiveDaysOff: number;
  /** Número preferido de días de descanso consecutivos. */
  preferredConsecutiveDaysOff: number;
  /** Mínimo número de días de descanso consecutivos requeridos antes de volver a trabajar. */
  minConsecutiveDaysOffRequiredBeforeWork?: number;
}

/**
 * Representa los posibles patrones de trabajo generales que un empleado puede tener.
 * - `standardRotation`: El empleado sigue una rotación estándar y puede tener preferencias de turno fijo diario.
 * - `mondayToFridayMorning`: El empleado trabaja solo mañanas de Lunes a Viernes, descansa fines de semana y feriados L-V.
 * - `mondayToFridayAfternoon`: El empleado trabaja solo tardes de Lunes a Viernes, descansa fines de semana y feriados L-V.
 * - `null`: Indica que no se ha especificado un patrón, se asume `standardRotation`.
 */
export type WorkPattern = 'standardRotation' | 'mondayToFridayMorning' | 'mondayToFridayAfternoon' | null;

/**
 * Define las preferencias de horario de un empleado.
 */
export interface EmployeePreferences {
  /** Indica si el empleado es elegible para un día libre después de una guardia (ej. "D/D"). */
  eligibleForDayOffAfterDuty?: boolean;
  /** Indica si el empleado prefiere trabajar los fines de semana. */
  prefersWeekendWork?: boolean;
  /** Días de la semana en los que el empleado tiene un turno fijo (ej., ["lunes", "martes"]). Normalizado a minúsculas sin acentos. */
  fixedWeeklyShiftDays?: string[];
  /**
   * Horario del turno fijo semanal.
   * Puede ser "mañana", "tarde", "noche", "rest_day" (para descanso fijo ese día),
   * o un valor especial como "none_selected" si no hay horario fijo.
   * `null` también indica que no hay horario fijo.
   */
  fixedWeeklyShiftTiming: string | null;
  /** Patrón de trabajo general del empleado. */
  workPattern?: WorkPattern;
}

/**
 * Representa una asignación fija para un empleado, como un descanso programado, licencia anual o médica.
 */
export interface FixedAssignment {
  /** Tipo de asignación fija: 'D' (Descanso), 'LAO' (Licencia Anual Ordinaria), 'LM' (Licencia Médica). */
  type: 'D' | 'LAO' | 'LM';
  /** Fecha de inicio de la asignación en formato YYYY-MM-DD. */
  startDate: string;
  /** Fecha de fin de la asignación en formato YYYY-MM-DD. Requerida para LAO y LM. Opcional para 'D' (se asume un solo día si no se especifica). */
  endDate?: string;
  /** Descripción opcional de la asignación. */
  description?: string;
}

/**
 * Representa a un empleado del hospital.
 */
export interface Employee {
  /** Identificador único del empleado. */
  id: string;
  /** Nombre completo del empleado. */
  name: string;
  /** Información de contacto (ej. email o teléfono). */
  contact: string;
  /** IDs de los servicios en los que el empleado puede trabajar. */
  serviceIds: string[];
  /** Roles del empleado (ej. "Enfermero", "Doctor", "Técnico"). */
  roles: string[];
  /** Preferencias de horario del empleado. */
  preferences?: EmployeePreferences;
  /** Descripción textual de la disponibilidad general del empleado (ej. "Lun-Vie 9-5"). */
  availability: string;
  /** Cualquier otra restricción específica del empleado (ej. "Máx 40 horas/semana"). */
  constraints: string;
  /** Lista de asignaciones fijas para el empleado. */
  fixedAssignments?: FixedAssignment[];
}

/**
 * Representa un turno de trabajo tal como es generado por la IA o manejado en la UI editable.
 * Este es el formato primario para los turnos dentro de un `MonthlySchedule`.
 */
export interface AIShift {
  /** Fecha del turno en formato YYYY-MM-DD. */
  date: string;
  /** Hora de inicio del turno en formato HH:MM. Puede ser vacío para turnos no laborables (D, LAO, LM, C, F). */
  startTime: string;
  /** Hora de fin del turno en formato HH:MM. Puede ser vacío para turnos no laborables. */
  endTime: string;
  /** Nombre completo del empleado asignado al turno. */
  employeeName: string;
  /** Nombre del servicio para el cual es el turno. */
  serviceName: string;
  /** Notas adicionales sobre el turno. Usado para indicar el tipo de turno (ej. "Turno Mañana (M)", "D (Descanso)"). */
  notes?: string;
}

/**
 * Representa un turno de trabajo individual, como podría ser almacenado en una colección separada si fuera necesario.
 * Actualmente, `AIShift` es el formato principal usado dentro de `MonthlySchedule`.
 * Esta interfaz se mantiene por si se decide tener una colección `shifts` separada en el futuro.
 */
export interface Shift {
  /** Identificador único del turno. */
  id: string;
  /** ID del empleado asignado. */
  employeeId: string;
  /** ID del servicio al que pertenece el turno. */
  serviceId: string;
  /** Fecha del turno en formato YYYY-MM-DD. */
  date: string;
  /** Hora de inicio del turno en formato HH:MM. */
  startTime: string;
  /** Hora de fin del turno en formato HH:MM. */
  endTime: string;
  /** Notas adicionales sobre el turno. */
  notes?: string;
}

/**
 * Representa un día feriado.
 */
export interface Holiday {
  /** Identificador único del feriado. */
  id: string;
  /** Fecha del feriado en formato YYYY-MM-DD. */
  date: string;
  /** Nombre del feriado (ej. "Navidad", "Día del Trabajador"). */
  name: string;
}

/**
 * Describe una violación de reglas o preferencias detectada en un horario.
 */
export interface ScheduleViolation {
  /** Nombre del empleado si la violación es específica de uno. */
  employeeName?: string;
  /** Fecha de la violación en formato YYYY-MM-DD. */
  date?: string;
  /** Tipo de turno ('M', 'T', 'N') o 'General' si aplica a todo el día o empleado. */
  shiftType?: 'M' | 'T' | 'N' | 'General';
  /** Descripción corta de la regla incumplida (ej. "Falta de personal en Turno Mañana"). */
  rule: string;
  /** Detalles específicos de la violación. */
  details: string;
  /** Severidad de la violación: 'error' para reglas duras, 'warning' para blandas/preferencias. */
  severity: 'error' | 'warning';
  /** Categoría de la violación, útil para agrupar o puntuar. */
  category?: 'serviceRule' | 'employeeWellbeing';
}

/**
 * Contiene el desglose de la puntuación de un horario, separando entre reglas del servicio y bienestar del personal.
 */
export interface ScoreBreakdown {
  /** Puntuación relacionada con el cumplimiento de las reglas del servicio (dotación, etc.). */
  serviceRules: number;
  /** Puntuación relacionada con el bienestar del personal (consecutividad, descansos, preferencias). */
  employeeWellbeing: number;
}

/**
 * Representa un horario mensual completo para un servicio específico.
 */
export interface MonthlySchedule {
  /** Identificador único del horario mensual. */
  id: string;
  /** Clave única generada como `YYYY-MM-ServiceID` para facilitar búsquedas y agrupaciones. */
  scheduleKey: string;
  /** Año del horario (ej. "2024"). */
  year: string;
  /** Mes del horario (ej. "1" para Enero, "12" para Diciembre). */
  month: string;
  /** ID del servicio al que pertenece este horario. */
  serviceId: string;
  /** Nombre del servicio (guardado por denormalización para fácil visualización). */
  serviceName: string;
  /** Array de todos los turnos (`AIShift`) que componen este horario. */
  shifts: AIShift[];
  /** Estado del horario: 'draft' (borrador), 'published' (activo), 'archived' (histórico). */
  status: 'draft' | 'published' | 'archived';
  /** Versión del horario, se incrementa cada vez que se publica una nueva versión para la misma clave. */
  version: number;
  /** Texto de respuesta o resumen generado por la IA o el algoritmo al crear este horario. */
  responseText?: string;
  /** Puntuación general del horario (0-100), si fue evaluado. */
  score?: number;
  /** Lista de violaciones de reglas o preferencias encontradas en este horario. */
  violations?: ScheduleViolation[];
  /** Desglose de la puntuación del horario. */
  scoreBreakdown?: ScoreBreakdown;
  /** Timestamp (milisegundos) de cuándo se creó el registro del horario en la base de datos. */
  createdAt: number;
  /** Timestamp (milisegundos) de la última actualización del registro del horario. */
  updatedAt: number;
}

/**
 * Props para el componente `InteractiveScheduleGrid`.
 */
export interface InteractiveScheduleGridProps {
  /** Array de turnos iniciales para mostrar y editar en la grilla. */
  initialShifts: AIShift[];
  /** Lista completa de todos los empleados disponibles en el sistema. */
  allEmployees: Employee[];
  /** El servicio específico para el cual se está mostrando/editando el horario. */
  targetService: Service | undefined;
  /** Mes del horario (string, ej. "1" para Enero). */
  month: string;
  /** Año del horario (string, ej. "2024"). */
  year: string;
  /** Lista de feriados a considerar, para resaltarlos en la grilla. */
  holidays?: Holiday[];
  /** Callback que se invoca cuando los turnos en la grilla cambian. */
  onShiftsChange?: (updatedShifts: AIShift[]) => void;
  /** Callback para volver a la vista de configuración (usado en el generador). */
  onBackToConfig?: () => void;
  /** Si es true, la grilla es de solo lectura y no se pueden editar los turnos. */
  isReadOnly?: boolean;
}

// --- Tipos para Informes ---

/**
 * Métricas de un empleado para el informe comparativo.
 */
export interface EmployeeReportMetrics {
  /** ID del empleado. */
  employeeId: string;
  /** Nombre del empleado. */
  employeeName: string;
  /** Número total de días asignados en el periodo (trabajo, descanso, licencia, etc.). */
  totalAssignedDays: number;
  /** Número de días de trabajo (turnos M, T, N). */
  workDays: number;
  /** Número de días de trabajo en fin de semana (que no sea feriado). */
  weekendWorkDays: number;
  /** Número de días de trabajo en un día feriado. */
  holidayWorkDays: number;
  /** Número de días de descanso (D o F) en fin de semana. */
  weekendRestDays: number;
  /** Número de días de descanso asignados (D). */
  restDays: number;
  /** Número de días de Licencia Anual Ordinaria (LAO). */
  ptoDays: number;
  /** Número de días de Licencia Médica (LM). */
  sickLeaveDays: number;
  /** Número de días de Franco Compensatorio (C). */
  compOffDays: number;
  /** Número de días feriados asignados como libres (F). */
  holidaysOff: number;
  /** Número de turnos de Mañana (M). */
  shiftsM: number;
  /** Número de turnos de Tarde (T). */
  shiftsT: number;
  /** Número de turnos de Noche (N). */
  shiftsN: number;
  /** Ratio de días de trabajo vs. días libres (ej. "20 W : 8 L"). */
  workToRestRatio: string;
}

/**
 * Estructura de salida para el informe comparativo de empleados.
 */
export interface EmployeeComparisonReportOutput {
  /** Tipo de informe, para identificación. */
  reportType: 'employeeComparison';
  /** Array de métricas, una por empleado. */
  data: EmployeeReportMetrics[];
  /** Etiqueta legible del rango de fechas del informe (ej. "Enero 2023 - Marzo 2023"). */
  dateRangeLabel: string;
  /** Nombre del servicio para el cual se generó el informe, o "Todos los Servicios". */
  serviceNameLabel?: string;
}

/**
 * Estructura de salida para el informe de calidad de un horario específico.
 */
export interface ScheduleQualityReportOutput {
  /** Tipo de informe, para identificación. */
  reportType: 'scheduleQuality';
  /** Clave del horario evaluado (YYYY-MM-ServiceID). */
  scheduleKey: string;
  /** Nombre del servicio del horario. */
  serviceName: string;
  /** Etiqueta legible del periodo del horario (ej. "Enero 2024"). */
  dateLabel: string;
  /** Puntuación general del horario (0-100), o null/undefined si no está disponible. */
  score: number | null | undefined;
  /** Lista de violaciones encontradas, o null/undefined si no hay o no está disponible. */
  violations: ScheduleViolation[] | null | undefined;
  /** Desglose de la puntuación, o null/undefined si no está disponible. */
  scoreBreakdown: ScoreBreakdown | null | undefined;
}

/**
 * Define un servicio del hospital y sus reglas de planificación.
 */
export interface Service {
  /** Identificador único del servicio. */
  id: string;
  /** Nombre del servicio (ej. "Emergencias", "Cardiología"). */
  name: string;
  /** Descripción breve del servicio. */
  description: string;
  /** Indica si el servicio opera con turno noche (N). */
  enableNightShift: boolean;
  /** Necesidades de personal para este servicio. */
  staffingNeeds: StaffingNeeds;
  /** Reglas de consecutividad de trabajo y descanso. */
  consecutivenessRules?: ConsecutivenessRules;
  /** Objetivo numérico de fines de semana completos (Sáb+Dom) de descanso por mes para los empleados. */
  targetCompleteWeekendsOff?: number;
  /** Notas adicionales o reglas específicas del servicio. */
  additionalNotes?: string;
}

    