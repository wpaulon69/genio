
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

// Mock data is no longer exported as the primary source of data.
// It can be kept here for reference or for seeding the database initially if needed.
const mockServicesData: Service[] = [
  { id: 's1', name: 'Emergencias', description: 'Maneja casos de emergencia', rules: 'Mínimo 2 enfermeras, 1 médico por turno. Turnos máximos de 12 horas.' },
  { id: 's2', name: 'Cardiología', description: 'Tratamientos relacionados con el corazón', rules: 'Se requieren cardiólogos especializados. Sistema de guardia activo.' },
  { id: 's3', name: 'Pediatría', description: 'Servicios de atención médica infantil', rules: 'Solo especialistas pediátricos. Ambiente amigable crucial.' },
];

const mockEmployeesData: Employee[] = [
  { id: 'e1', name: 'Dra. Alicia Pérez', contact: 'alicia@hospital.com', serviceIds: ['s1', 's2'], roles: ['Doctora', 'Cardióloga'], preferences: 'Prefiere turnos de mañana, no más de 2 turnos de noche al mes.', availability: 'Lun-Vie, disponible para guardia los fines de semana.', constraints: 'Turnos máximos de 10 horas.' },
  { id: 'e2', name: 'Enf. Roberto Gómez', contact: 'roberto@hospital.com', serviceIds: ['s1', 's3'], roles: ['Enfermero', 'Enfermero Pediátrico'], preferences: 'Evita turnos consecutivos.', availability: 'Flexible, prefiere 3-4 turnos por semana.', constraints: '' },
  { id: 'e3', name: 'Téc. Carla Blanco', contact: 'carla@hospital.com', serviceIds: ['s2'], roles: ['Técnica'], preferences: 'Le gustan los turnos de fin de semana por el plus.', availability: 'Mié-Dom.', constraints: 'Requiere 2 días libres consecutivos.' },
];

const mockShiftsData: Shift[] = [
  { id: 'sh1', employeeId: 'e1', serviceId: 's1', date: '2024-07-15', startTime: '08:00', endTime: '16:00', notes: 'Turno de mañana' },
  { id: 'sh2', employeeId: 'e2', serviceId: 's1', date: '2024-07-15', startTime: '08:00', endTime: '20:00', notes: 'Turno largo de día' },
  { id: 'sh3', employeeId: 'e1', serviceId: 's2', date: '2024-07-16', startTime: '14:00', endTime: '22:00', notes: 'Tarde de cardiología' },
  { id: 'sh4', employeeId: 'e3', serviceId: 's2', date: '2024-07-16', startTime: '09:00', endTime: '17:00' },
];

// If you need to seed data, you could write a script that uses these arrays
// and the addService/addEmployee/addShift functions.
