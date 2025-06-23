/**
 * @fileOverview Define todas las interfaces y tipos de datos TypeScript utilizados en la aplicación ShiftFlow.
 */

export interface Service {
  id_servicio: number;
  nombre_servicio: string;
  descripcion: string | null;
  habilitar_turno_noche: boolean;
  dotacion_objetivo_lunes_a_viernes_mananas: number;
  dotacion_objetivo_lunes_a_viernes_tardes: number;
  dotacion_objetivo_lunes_a_viernes_noche: number;
  dotacion_objetivo_sab_dom_feriados_mananas: number;
  dotacion_objetivo_sab_dom_feriados_tardes: number;
  dotacion_objetivo_sab_dom_feriados_noche: number;
  max_dias_trabajo_consecutivos: number;
  max_descansos_consecutivos: number;
  dias_trabajo_consecutivos_preferidos: number;
  dias_descanso_consecutivos_preferidos: number;
  min_descansos_requeridos_antes_de_trabajar: number;
  fds_descanso_completo_objetivo: number;
  notas_adicionales: string | null;
}

export interface Employee {
  id_empleado: number;
  id_servicio: number;
  nombre: string;
  email_empleado: string;
  tipo_patron_trabajo: string;
  elegible_franco_pos_guardia: boolean;
  prefiere_trabajar_fines_semana: boolean;
  disponibilidad_general: string | null;
  restricciones_especificas: string | null;
  turnos_fijos?: TurnoFijo[];
  asignaciones?: AsignacionEmpleado[];
}

export interface TurnoFijo {
  id_turno_fijo: number;
  id_empleado: number;
  dia_semana: 'Lunes' | 'Martes' | 'Miercoles' | 'Jueves' | 'Viernes' | 'Sabado' | 'Domingo';
  tipo_turno: 'Mañana' | 'Tarde' | 'Noche' | 'Descanso';
}

export interface AsignacionEmpleado {
  id_asignacion: number;
  id_empleado: number;
  id_tipo_asignacion: number;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
  descripcion: string | null;
  tipo_asignacion?: TipoAsignacion;
}

export interface TipoAsignacion {
  id_tipo_asignacion: number;
  nombre_tipo: string;
  descripcion: string | null;
  es_licencia: boolean;
}

export interface PatronTrabajo {
  id_patron: number;
  nombre_patron: string;
  descripcion: string | null;
}

export interface Holiday {
  id: number;
  date: string; // YYYY-MM-DD
  name: string;
}

// Interfaces para el generador de horarios (pueden necesitar ajuste)
export interface AIShift {
  employeeId?: number;
  serviceId?: number;
  date: string;
  startTime: string;
  endTime: string;
  employeeName: string;
  serviceName: string;
  notes?: string;
}

export interface ScheduleViolation {
  employeeId?: number;
  employeeName?: string;
  date?: string;
  shiftType?: 'M' | 'T' | 'N' | 'General';
  rule: string;
  details: string;
  severity: 'error' | 'warning';
  category?: 'serviceRule' | 'employeeWellbeing';
}

export interface ScoreBreakdown {
  serviceRules: number;
  employeeWellbeing: number;
}

export interface MonthlySchedule {
  id: string;
  scheduleKey: string;
  year: string;
  month: string;
  serviceId: string;
  serviceName: string;
  horario_nombre?: string | null; // Nuevo campo para el nombre del horario
  shifts: AIShift[];
  status: 'draft' | 'published' | 'archived';
  version: number;
  responseText?: string | null | undefined;
  score?: number | null | undefined;
  violations?: ScheduleViolation[] | null | undefined;
  scoreBreakdown?: ScoreBreakdown | null | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface InteractiveScheduleGridProps {
  initialShifts: AIShift[];
  allEmployees: Employee[];
  targetService: Service | null;
  month: string;
  year: string;
  holidays?: Holiday[];
  onShiftsChange?: (newShifts: AIShift[]) => void;
  onBackToConfig?: () => void;
  isReadOnly?: boolean;
  onSave?: (shifts: AIShift[], status: 'published' | 'draft') => void;
}
