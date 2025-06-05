
'use server';

import type { Service, Employee, FixedAssignment } from '@/lib/types';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule'; // Reusing this type for now
import { format, getDaysInMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getDay } from 'date-fns';
import { es } from 'date-fns/locale/es'; // Import Spanish locale
import { SHIFT_OPTIONS } from '@/components/schedule/InteractiveScheduleGrid'; // For default times

interface AlgorithmicScheduleOutput {
  generatedShifts: AIShift[];
  responseText: string;
}

// Helper to check if a date falls within a range
const isDateInRange = (date: Date, startDate: Date, endDate?: Date): boolean => {
  if (endDate) {
    return isWithinInterval(date, { start: startOfDay(startDate), end: endOfDay(endDate) });
  }
  return format(startOfDay(date), 'yyyy-MM-dd') === format(startOfDay(startDate), 'yyyy-MM-dd');
};

const isEmployeeOnFixedAssignmentOnDate = (
  employee: Employee,
  targetDate: Date,
): FixedAssignment | null => {
  if (!employee.fixedAssignments || employee.fixedAssignments.length === 0) {
    return null;
  }
  for (const assignment of employee.fixedAssignments) {
    if (!assignment.startDate) continue;
    const assignmentStartDate = parseISO(assignment.startDate);
    const assignmentEndDate = assignment.endDate ? parseISO(assignment.endDate) : assignmentStartDate;

    if (isDateInRange(targetDate, assignmentStartDate, assignmentEndDate)) {
      return assignment;
    }
  }
  return null;
};


const getShiftDetails = (shiftCode: 'M' | 'T' | 'N'): { startTime: string; endTime: string; notesSuffix: string } => {
    const option = SHIFT_OPTIONS.find(opt => opt.value === shiftCode);
    return {
        startTime: option?.startTime || '',
        endTime: option?.endTime || '',
        notesSuffix: `(${shiftCode})`
    };
}

export async function generateAlgorithmicSchedule(
  service: Service,
  month: string, // "1"-"12"
  year: string,  // "2024"
  allEmployees: Employee[]
): Promise<AlgorithmicScheduleOutput> {
  const generatedShifts: AIShift[] = [];
  const monthInt = parseInt(month, 10);
  const yearInt = parseInt(year, 10);
  const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));

  const employeesForService = allEmployees.filter(emp => emp.serviceIds.includes(service.id));
  if (employeesForService.length === 0) {
    return { generatedShifts: [], responseText: `No hay empleados asignados al servicio ${service.name} para generar el horario.` };
  }

  // Track shifts per employee for very basic load balancing
  const employeeShiftCounts: Record<string, number> = {};
  employeesForService.forEach(emp => employeeShiftCounts[emp.id] = 0);

  for (let day = 1; day <= daysInMonthCount; day++) {
    const currentDate = new Date(yearInt, monthInt - 1, day);
    const currentDateStr = format(currentDate, 'yyyy-MM-dd');
    const dayOfWeek = getDay(currentDate); // 0 for Sunday, 1 for Monday, etc.
    const isWeekendOrHoliday = dayOfWeek === 0 || dayOfWeek === 6; // Basic: Sunday or Saturday

    const staffingNeeds = {
      morning: isWeekendOrHoliday ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
      afternoon: isWeekendOrHoliday ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
      night: (service.enableNightShift && isWeekendOrHoliday) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
    };

    const dailyAssignedEmployees = new Set<string>(); // Track employees assigned any shift on this day

    // Filter available employees for this specific day
    let availableEmployeesToday = employeesForService.filter(emp => {
        const fixedAssignment = isEmployeeOnFixedAssignmentOnDate(emp, currentDate);
        if (fixedAssignment) {
            // If it's a 'D', 'LAO', or 'LM', create that shift and mark unavailable for work shifts
            generatedShifts.push({
                date: currentDateStr,
                employeeName: emp.name,
                serviceName: service.name,
                startTime: '', // No specific time for these assignments
                endTime: '',
                notes: fixedAssignment.type + (fixedAssignment.description ? ` - ${fixedAssignment.description}` : ''),
            });
            dailyAssignedEmployees.add(emp.id); // Mark as assigned for the day (even if it's a non-work assignment)
            return false; // Not available for work shifts
        }
        return true; // Available if no conflicting fixed assignment
    });
    
    // Sort available employees by fewest shifts assigned so far for basic balancing
    availableEmployeesToday.sort((a, b) => employeeShiftCounts[a.id] - employeeShiftCounts[b.id]);

    const assignShiftsForType = (
        shiftType: 'M' | 'T' | 'N',
        needed: number,
        notesPrefix: string
      ) => {
        let assignedCount = 0;
        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftType);

        for (const emp of availableEmployeesToday) {
          if (assignedCount >= needed) break;
          if (!dailyAssignedEmployees.has(emp.id)) { // Check if already assigned a work shift or fixed assignment today
            generatedShifts.push({
              date: currentDateStr,
              employeeName: emp.name,
              serviceName: service.name,
              startTime: startTime,
              endTime: endTime,
              notes: `${notesPrefix} ${notesSuffix}`,
            });
            dailyAssignedEmployees.add(emp.id);
            employeeShiftCounts[emp.id]++;
            assignedCount++;
          }
        }
      };
    
    assignShiftsForType('M', staffingNeeds.morning, format(currentDate, 'EEEE', { locale: es }));
    assignShiftsForType('T', staffingNeeds.afternoon, format(currentDate, 'EEEE', { locale: es }));
    if (service.enableNightShift && staffingNeeds.night > 0) {
      assignShiftsForType('N', staffingNeeds.night, format(currentDate, 'EEEE', { locale: es }));
    }
  }

  return {
    generatedShifts,
    responseText: `Horario generado algorítmicamente para ${service.name} para ${format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es })}. Se crearon ${generatedShifts.length} turnos.`,
  };
}
