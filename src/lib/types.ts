
export interface StaffingNeeds {
  morningWeekday: number;
  afternoonWeekday: number;
  nightWeekday: number;
  morningWeekendHoliday: number;
  afternoonWeekendHoliday: number;
  nightWeekendHoliday: number;
}

export interface ConsecutivenessRules {
  maxConsecutiveWorkDays: number;
  preferredConsecutiveWorkDays: number;
  maxConsecutiveDaysOff: number;
  preferredConsecutiveDaysOff: number;
  minConsecutiveDaysOffRequiredBeforeWork?: number;
}

export type WorkPattern = 'standardRotation' | 'mondayToFridayMorning' | 'mondayToFridayAfternoon' | null;

export interface EmployeePreferences {
  eligibleForDayOffAfterDuty?: boolean;
  prefersWeekendWork?: boolean;
  fixedWeeklyShiftDays?: string[]; // e.g., ["lunes", "martes", ..., "domingo"]
  fixedWeeklyShiftTiming: string | null; // e.g., "mañana", "tarde", "noche", "rest_day", or custom like "08:00-16:00", or null
  workPattern?: WorkPattern; // Nuevo campo para el patrón de trabajo
}

export interface FixedAssignment {
  type: 'D' | 'LAO' | 'LM';
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD, required for LAO/LM
  description?: string;
}

export interface Employee {
  id: string;
  name: string;
  contact: string; // e.g., email or phone
  serviceIds: string[]; // IDs of services they can work in
  roles: string[]; // e.g., "Nurse", "Doctor", "Technician"
  preferences?: EmployeePreferences;
  availability: string; // Textual description of availability (e.g., "Mon-Fri 9-5", "Not available on weekends")
  constraints: string; // Any other constraints (e.g., "Max 40 hours/week")
  fixedAssignments?: FixedAssignment[];
}

// AIShift se usa para la salida del generador de IA y la representación en la cuadrícula editable
export interface AIShift {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (puede ser vacío para D, LAO, LM, C)
  endTime: string; // HH:MM (puede ser vacío para D, LAO, LM, C)
  employeeName: string;
  serviceName: string;
  notes?: string; // e.g., "Turno Mañana (M)", "D (Descanso)"
}

// Shift representa un turno guardado en la BD (podría ser diferente de AIShift si es necesario)
export interface Shift {
  id: string;
  employeeId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  notes?: string;
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

export interface ScheduleViolation {
  employeeName?: string; // Nombre del empleado si la violación es específica de uno
  date?: string;         // Fecha de la violación (YYYY-MM-DD)
  shiftType?: 'M' | 'T' | 'N' | 'General'; // Tipo de turno o General si aplica a todo el día/empleado
  rule: string;         // Descripción corta de la regla incumplida (ej. "Falta de personal en Turno Mañana")
  details: string;      // Detalles específicos de la violación
  severity: 'error' | 'warning'; // 'error' para reglas duras, 'warning' para blandas/preferencias
  category?: 'serviceRule' | 'employeeWellbeing'; // Nueva categoría de violación
}

export interface ScoreBreakdown {
  serviceRules: number;
  employeeWellbeing: number;
}

export interface MonthlySchedule {
  id: string;
  scheduleKey: string; // YYYY-MM-ServiceID
  year: string;
  month: string;
  serviceId: string;
  serviceName: string;
  shifts: AIShift[];
  status: 'active' | 'inactive'; // 'active' es la versión actual, 'inactive' son versiones archivadas
  version: number;
  responseText?: string;
  score?: number;
  violations?: ScheduleViolation[];
  scoreBreakdown?: ScoreBreakdown; // Nuevo desglose de puntaje
  createdAt: number; // Timestamp milliseconds
  updatedAt: number; // Timestamp milliseconds
}

export interface InteractiveScheduleGridProps {
  initialShifts: AIShift[];
  allEmployees: Employee[];
  targetService: Service | undefined;
  month: string;
  year: string;
  holidays?: Holiday[];
  onShiftsChange?: (updatedShifts: AIShift[]) => void;
  onBackToConfig?: () => void;
  isReadOnly?: boolean;
}

// Tipos para el nuevo informe comparativo de empleados
export interface EmployeeReportMetrics {
  employeeId: string;
  employeeName: string;
  totalAssignedDays: number;
  workDays: number; // M, T, N
  weekendWorkDays: number; // M, T, N en Sábado o Domingo (que no sea feriado)
  holidayWorkDays: number; // M, T, N en día feriado
  weekendRestDays: number; // D o F en Sábado o Domingo
  restDays: number; // D
  ptoDays: number; // LAO
  sickLeaveDays: number; // LM
  compOffDays: number; // C
  holidaysOff: number; // F (Feriado asignado como día libre)
  shiftsM: number;
  shiftsT: number;
  shiftsN: number;
  workToRestRatio: string; // e.g., "20 W : 8 L"
}

export interface EmployeeComparisonReportOutput {
  reportType: 'employeeComparison';
  data: EmployeeReportMetrics[];
  dateRangeLabel: string;
  serviceNameLabel?: string;
}

