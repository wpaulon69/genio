
export type GridShiftType = 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F' | ''; // Añadir 'F'

export interface ShiftOption {
  value: GridShiftType;
  label: string; // Full label e.g., "Mañana (M)"
  displayValue: string; // Abbreviation e.g., "M"
  startTime?: string;
  endTime?: string;
}

// Definiciones estándar de turnos
export const SHIFT_OPTIONS: ShiftOption[] = [
  { value: 'M', label: 'Mañana (M)', displayValue: 'M', startTime: '07:00', endTime: '15:00' },
  { value: 'T', label: 'Tarde (T)', displayValue: 'T', startTime: '15:00', endTime: '23:00' },
  { value: 'N', label: 'Noche (N)', displayValue: 'N', startTime: '23:00', endTime: '07:00' }, // Noche puede cruzar medianoche
  { value: 'D', label: 'Descanso (D)', displayValue: 'D' },
  { value: 'C', label: 'Franco Comp. (C)', displayValue: 'C' },
  { value: 'LAO', label: 'LAO', displayValue: 'LAO' },
  { value: 'LM', label: 'LM', displayValue: 'LM' },
  { value: 'F', label: 'Feriado (F)', displayValue: 'F' }, // Nueva opción
  { value: '', label: 'Vacío (-)', displayValue: '-' }, // Option to clear the cell
];
