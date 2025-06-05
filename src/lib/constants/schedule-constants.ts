
export type GridShiftType = 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | '';

export interface ShiftOption {
  value: GridShiftType;
  label: string;
  startTime?: string;
  endTime?: string;
}

// Definiciones estándar de turnos
export const SHIFT_OPTIONS: ShiftOption[] = [
  { value: 'M', label: 'Mañana (M)', startTime: '07:00', endTime: '15:00' },
  { value: 'T', label: 'Tarde (T)', startTime: '15:00', endTime: '23:00' },
  { value: 'N', label: 'Noche (N)', startTime: '23:00', endTime: '07:00' }, // Noche puede cruzar medianoche
  { value: 'D', label: 'Descanso (D)' },
  { value: 'C', label: 'Franco Comp. (C)' },
  { value: 'LAO', label: 'LAO' },
  { value: 'LM', label: 'LM' },
];
