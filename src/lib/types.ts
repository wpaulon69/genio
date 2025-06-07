
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
  minConsecutiveDaysOffRequiredBeforeWork?: number; // Nuevo: Mínimo descanso antes de volver a trabajar
}

export interface Service {
  id: string;
  name: string;
  description: string;
  enableNightShift: boolean;
  staffingNeeds: StaffingNeeds;
  consecutivenessRules?: ConsecutivenessRules;
  additionalNotes?: string;
}

export interface EmployeePreferences {
  eligibleForDayOffAfterDuty?: boolean;
  prefersWeekendWork?: boolean;
  fixedWeeklyShiftDays?: string[]; // e.g., ["lunes", "martes", ..., "domingo"]
  fixedWeeklyShiftTiming: string | null; // e.g., "mañana", "tarde", "noche", "rest_day", or custom like "08:00-16:00", or null
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
  employeeName?: string;
  date?: string;
  shiftType?: 'M' | 'T' | 'N' | 'General';
  rule: string;
  details: string;
  severity: 'error' | 'warning';
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
  createdAt: number; // Timestamp milliseconds
  updatedAt: number; // Timestamp milliseconds
}
