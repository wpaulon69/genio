export interface Service {
  id: string;
  name: string;
  description: string;
  rules: string; // Service-specific rules and requirements
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

// Mock data for demonstration
export const mockServices: Service[] = [
  { id: 's1', name: 'Emergency', description: 'Handles emergency cases', rules: 'Minimum 2 nurses, 1 doctor per shift. Max 12-hour shifts.' },
  { id: 's2', name: 'Cardiology', description: 'Heart-related treatments', rules: 'Specialized cardiologists required. On-call system active.' },
  { id: 's3', name: 'Pediatrics', description: 'Child healthcare services', rules: 'Pediatric specialists only. Friendly environment crucial.' },
];

export const mockEmployees: Employee[] = [
  { id: 'e1', name: 'Dr. Alice Smith', contact: 'alice@hospital.com', serviceIds: ['s1', 's2'], roles: ['Doctor', 'Cardiologist'], preferences: 'Prefers morning shifts, no more than 2 night shifts a month.', availability: 'Mon-Fri, available for on-call on weekends.', constraints: 'Max 10-hour shifts.' },
  { id: 'e2', name: 'Nurse Bob Johnson', contact: 'bob@hospital.com', serviceIds: ['s1', 's3'], roles: ['Nurse', 'Pediatric Nurse'], preferences: 'Avoids back-to-back shifts.', availability: 'Flexible, prefers 3-4 shifts per week.', constraints: '' },
  { id: 'e3', name: 'Tech Carol White', contact: 'carol@hospital.com', serviceIds: ['s2'], roles: ['Technician'], preferences: 'Likes weekend shifts for premium.', availability: 'Wed-Sun.', constraints: 'Requires 2 days off consecutively.' },
];

export const mockShifts: Shift[] = [
  { id: 'sh1', employeeId: 'e1', serviceId: 's1', date: '2024-07-15', startTime: '08:00', endTime: '16:00', notes: 'Morning shift' },
  { id: 'sh2', employeeId: 'e2', serviceId: 's1', date: '2024-07-15', startTime: '08:00', endTime: '20:00', notes: 'Long day shift' },
  { id: 'sh3', employeeId: 'e1', serviceId: 's2', date: '2024-07-16', startTime: '14:00', endTime: '22:00', notes: 'Cardiology afternoon' },
  { id: 'sh4', employeeId: 'e3', serviceId: 's2', date: '2024-07-16', startTime: '09:00', endTime: '17:00' },
];
