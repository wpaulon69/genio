
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
}

export interface Service {
  id: string;
  name: string;
  description: string;
  enableNightShift: boolean;
  staffingNeeds: StaffingNeeds;
  consecutivenessRules?: ConsecutivenessRules; // Añadido
  additionalNotes?: string;
}

export interface Employee {
  id: string;
  name: string;
  contact: string; // e.g., email or phone
  serviceIds: string[]; // IDs of services they can work in
  roles: string[]; // e.g., "Nurse", "Doctor", "Technician"
  preferences: string; // Textual description of preferences
  availability: string; // Textual description of availability (e.g., "Mon-Fri 9-5", "Not available on weekends")
  constraints: string; // Any other constraints (e.g., "Max 40 hours/week")
}

export interface Shift {
  id: string;
  employeeId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  notes?: string;
}
