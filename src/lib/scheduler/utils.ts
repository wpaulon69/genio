import { format, parseISO, addDays, getDay } from 'date-fns';
import type { AIShift, AsignacionEmpleado } from '@/lib/types';

export function getShiftTypeForEval(shift: AIShift): AIShift['notes'] | 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C' | 'F' | 'V' {
    if (shift.notes) {
        const note = shift.notes.toUpperCase();
        if (['LAO', 'LM', 'C', 'F', 'V'].includes(note)) {
            return note as 'LAO' | 'LM' | 'C' | 'F' | 'V';
        }
    }
    if (shift.startTime === '00:00' && shift.endTime === '00:00') return 'D';
    if (shift.startTime === '07:00') return 'M';
    if (shift.startTime === '14:00') return 'T';
    if (shift.startTime === '21:00') return 'N';
    return 'D';
}

export function isRestDay(shiftType: string | undefined): boolean {
    if (!shiftType) return true;
    return ['D', 'F', 'C', 'LAO', 'LM', 'V'].includes(shiftType.toUpperCase());
}

export function getShiftDetails(shiftType: 'M' | 'T' | 'N' | 'D'): { startTime: string, endTime: string } {
    switch (shiftType) {
        case 'M': return { startTime: '07:00', endTime: '14:00' };
        case 'T': return { startTime: '14:00', endTime: '21:00' };
        case 'N': return { startTime: '21:00', endTime: '07:00' };
        default: return { startTime: '00:00', endTime: '00:00' };
    }
}

export function getShiftDateTime(date: Date, time: string, isNightShiftNextDay?: boolean): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const dateTime = new Date(date);
    dateTime.setHours(hours, minutes, 0, 0);
    if (isNightShiftNextDay) {
        return addDays(dateTime, 1);
    }
    return dateTime;
}

export function isWeekend(date: Date): boolean {
    const day = getDay(date);
    return day === 0 || day === 6;
}

export function isHoliday(date: Date, holidays: { date: string }[]): boolean {
    const dateStr = format(date, 'yyyy-MM-dd');
    return holidays.some(h => h.date === dateStr);
}

export function isEmployeeOnLeave(date: Date, assignments: AsignacionEmpleado[]): boolean {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignments.some(a => {
        const startDate = format(parseISO(a.fecha_inicio), 'yyyy-MM-dd');
        const endDate = format(parseISO(a.fecha_fin), 'yyyy-MM-dd');
        return dateStr >= startDate && dateStr <= endDate;
    });
}

export function canAssignShiftDueToRest(
    lastShiftEndTime: Date | null,
    currentShiftStartTime: Date,
    minRestHours: number
): boolean {
    if (!lastShiftEndTime) return true;
    const hoursSinceLastShift = (currentShiftStartTime.getTime() - lastShiftEndTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastShift >= minRestHours;
}

export function normalizeDayName(day: number): 'Lunes' | 'Martes' | 'Miercoles' | 'Jueves' | 'Viernes' | 'Sabado' | 'Domingo' {
    const dayMap: { [key: number]: 'Lunes' | 'Martes' | 'Miercoles' | 'Jueves' | 'Viernes' | 'Sabado' | 'Domingo' } = { 1: 'Lunes', 2: 'Martes', 3: 'Miercoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sabado', 0: 'Domingo' };
    return dayMap[day];
}

export function isEmployeeOnFixedAssignmentOnDate(
    date: Date,
    fixedAssignments: any[]
): any | null {
    const dateStr = format(date, 'yyyy-MM-dd');
    return fixedAssignments.find(a => a.startDate <= dateStr && a.endDate >= dateStr) || null;
}
