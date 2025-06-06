
'use server';

import type { Service, Employee, FixedAssignment, Holiday } from '@/lib/types';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule';
import { format, getDaysInMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getDay, subDays, lastDayOfMonth, isValid, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { SHIFT_OPTIONS } from '@/lib/constants/schedule-constants';

interface AlgorithmicScheduleOutput {
  generatedShifts: AIShift[];
  responseText: string;
}

interface EmployeeState {
  id: string;
  name: string;
  consecutiveWorkDays: number;
  consecutiveRestDays: number;
  shiftsThisMonth: number; 
  lastShiftType?: AIShift['notes'] | 'M' | 'T' | 'N' | 'D' | 'LAO' | 'LM' | 'C';
}

const DAYS_OF_WEEK_MAP: { [key: string]: number } = {
    'domingo': 0, // date-fns getDay()
    'lunes': 1,
    'martes': 2,
    'miercoles': 3,
    'jueves': 4,
    'viernes': 5,
    'sabado': 6,
};

const NO_FIXED_TIMING_VALUE = "none_selected";
const REST_DAY_VALUE = "rest_day";


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

    if (!isValid(assignmentStartDate) || (assignment.endDate && !isValid(assignmentEndDate))) continue;

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
  allEmployees: Employee[],
  holidays: Holiday[],
  previousMonthShifts: AIShift[] | null
): Promise<AlgorithmicScheduleOutput> {
  const generatedShifts: AIShift[] = [];
  const monthInt = parseInt(month, 10);
  const yearInt = parseInt(year, 10);
  const daysInMonthCount = getDaysInMonth(new Date(yearInt, monthInt - 1));
  const firstDayOfCurrentMonth = new Date(yearInt, monthInt - 1, 1);

  const employeesForService = allEmployees.filter(emp => emp.serviceIds.includes(service.id));
  if (employeesForService.length === 0) {
    return { generatedShifts: [], responseText: `No hay empleados asignados al servicio ${service.name} para generar el horario.` };
  }

  const employeeStates: Record<string, EmployeeState> = {};
  employeesForService.forEach(emp => {
    employeeStates[emp.id] = {
      id: emp.id,
      name: emp.name,
      consecutiveWorkDays: 0,
      consecutiveRestDays: 0,
      shiftsThisMonth: 0,
      lastShiftType: undefined,
    };
  });

  // Refined Initialization of employeeStates based on previousMonthShifts
  // Look back up to ~7 days (or maxConsecutiveWorkDays) to establish initial state
  const lookbackDays = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
  const sortedPreviousShifts = (previousMonthShifts || []).sort((a, b) => {
      const dateA = parseISO(a.date);
      const dateB = parseISO(b.date);
      if (dateA < dateB) return -1;
      if (dateA > dateB) return 1;
      return a.employeeName.localeCompare(b.employeeName);
  });

  for (let i = lookbackDays; i >= 1; i--) {
      const dateToCheck = subDays(firstDayOfCurrentMonth, i);
      const dateToCheckStr = format(dateToCheck, 'yyyy-MM-dd');

      for (const emp of employeesForService) {
          const state = employeeStates[emp.id];
          if (!state) continue;

          const shiftsForEmpOnDate = sortedPreviousShifts.filter(
              s => s.date === dateToCheckStr && s.employeeName === emp.name
          );

          let shiftToday: AIShift | undefined = shiftsForEmpOnDate[0]; // Assume one primary assignment for simplicity

          if (shiftToday) {
              if (shiftToday.startTime && shiftToday.endTime) { // M, T, N
                  state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                  state.consecutiveRestDays = 0;
                  const note = shiftToday.notes || '';
                  if (note.includes('(M)')) state.lastShiftType = 'M';
                  else if (note.includes('(T)')) state.lastShiftType = 'T';
                  else if (note.includes('(N)')) state.lastShiftType = 'N';
                  else state.lastShiftType = 'M'; 
              } else if (shiftToday.notes?.includes('D') || shiftToday.notes?.includes('LAO') || shiftToday.notes?.includes('LM') || shiftToday.notes?.includes('C')) {
                  state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === 'C' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
                  state.consecutiveWorkDays = 0;
                  if (shiftToday.notes?.includes('LAO')) state.lastShiftType = 'LAO';
                  else if (shiftToday.notes?.includes('LM')) state.lastShiftType = 'LM';
                  else if (shiftToday.notes?.includes('C')) state.lastShiftType = 'C';
                  else state.lastShiftType = 'D';
              }
          } else { // No shift found for employee on this day from previous month
               state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === 'C' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
               state.consecutiveWorkDays = 0;
               state.lastShiftType = 'D'; 
          }
      }
  }


  for (let day = 1; day <= daysInMonthCount; day++) {
    const currentDate = new Date(yearInt, monthInt - 1, day);
    const currentDateStrYYYYMMDD = format(currentDate, 'yyyy-MM-dd');
    const currentDayOfWeekNum = getDay(currentDate); // Sunday = 0, Saturday = 6
    const currentDayOfWeekName = format(currentDate, 'eeee', { locale: es }).toLowerCase(); // 'lunes', 'martes'
    const isWeekend = currentDayOfWeekNum === 0 || currentDayOfWeekNum === 6;
    const isHolidayDay = holidays.some(h => h.date === currentDateStrYYYYMMDD);
    const useWeekendHolidayStaffing = isWeekend || isHolidayDay;

    let staffingNeeds = {
      morning: useWeekendHolidayStaffing ? service.staffingNeeds.morningWeekendHoliday : service.staffingNeeds.morningWeekday,
      afternoon: useWeekendHolidayStaffing ? service.staffingNeeds.afternoonWeekendHoliday : service.staffingNeeds.afternoonWeekday,
      night: (service.enableNightShift && useWeekendHolidayStaffing) ? service.staffingNeeds.nightWeekendHoliday : (service.enableNightShift ? service.staffingNeeds.nightWeekday : 0),
    };

    const dailyAssignedWorkShifts = new Set<string>(); // Tracks emp.id for M, T, N
    const dailyProcessedEmployees = new Set<string>(); // Tracks emp.id for ANY assignment (LAO,LM,Fixed,M,T,N,D)

    // Paso 1: Procesar Ausencias (LAO, LM)
    employeesForService.forEach(emp => {
      if (dailyProcessedEmployees.has(emp.id)) return;
      const state = employeeStates[emp.id];
      const fixedAssignment = isEmployeeOnFixedAssignmentOnDate(emp, currentDate);
      if (fixedAssignment && (fixedAssignment.type === 'LAO' || fixedAssignment.type === 'LM')) {
        generatedShifts.push({
            date: currentDateStrYYYYMMDD,
            employeeName: emp.name,
            serviceName: service.name,
            startTime: '',
            endTime: '',
            notes: fixedAssignment.type + (fixedAssignment.description ? ` - ${fixedAssignment.description}` : ''),
        });
        dailyProcessedEmployees.add(emp.id);
        state.consecutiveRestDays = (state.lastShiftType === 'LAO' || state.lastShiftType === 'LM') ? state.consecutiveRestDays + 1 : 1;
        state.consecutiveWorkDays = 0;
        state.lastShiftType = fixedAssignment.type;
      }
    });

    // Paso 2: Procesar Turnos Fijos Semanales (Preferencias del Empleado)
    employeesForService.forEach(emp => {
        if (dailyProcessedEmployees.has(emp.id)) return; // Ya tiene LAO/LM
        const state = employeeStates[emp.id];
        const preferences = emp.preferences;

        if (preferences?.fixedWeeklyShiftDays && preferences.fixedWeeklyShiftDays.includes(currentDayOfWeekName)) {
            const fixedTiming = preferences.fixedWeeklyShiftTiming;
            if (fixedTiming && fixedTiming !== NO_FIXED_TIMING_VALUE) {
                if (fixedTiming === REST_DAY_VALUE || fixedTiming.toUpperCase() === 'D') {
                    generatedShifts.push({
                        date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name,
                        startTime: '', endTime: '', notes: 'D (Fijo Semanal)',
                    });
                    dailyProcessedEmployees.add(emp.id);
                    state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === 'C') ? state.consecutiveRestDays + 1 : 1;
                    state.consecutiveWorkDays = 0;
                    state.lastShiftType = 'D';
                } else if (['mañana', 'tarde', 'noche'].includes(fixedTiming.toLowerCase())) {
                    const shiftCode = fixedTiming.toLowerCase().charAt(0).toUpperCase() as 'M' | 'T' | 'N';
                    if (shiftCode === 'N' && !service.enableNightShift) return; 

                    let neededStaff = 0;
                    if (shiftCode === 'M') neededStaff = staffingNeeds.morning;
                    else if (shiftCode === 'T') neededStaff = staffingNeeds.afternoon;
                    else if (shiftCode === 'N') neededStaff = staffingNeeds.night;

                    const canWorkFixed = state.consecutiveWorkDays < (service.consecutivenessRules?.maxConsecutiveWorkDays || 7) &&
                                         (state.lastShiftType === 'D' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.consecutiveRestDays >= (service.consecutivenessRules?.minConsecutiveDaysOffRequiredBeforeWork || 1) || state.lastShiftType === undefined || (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N'));


                    if (neededStaff > 0 && canWorkFixed) {
                        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftCode);
                        generatedShifts.push({
                            date: currentDateStrYYYYMMDD, employeeName: emp.name, serviceName: service.name,
                            startTime, endTime, notes: `Turno Fijo ${notesSuffix}`,
                        });
                        dailyAssignedWorkShifts.add(emp.id);
                        dailyProcessedEmployees.add(emp.id);
                        state.shiftsThisMonth++;
                        state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
                        state.consecutiveRestDays = 0;
                        state.lastShiftType = shiftCode;

                        if (shiftCode === 'M') staffingNeeds.morning--;
                        else if (shiftCode === 'T') staffingNeeds.afternoon--;
                        else if (shiftCode === 'N') staffingNeeds.night--;
                    }
                }
            }
        }
    });


    // Paso 3: Cubrir Necesidades de Dotación (M, T, N) y Reglas de Servicio
    const assignShiftsForType = (
        shiftType: 'M' | 'T' | 'N',
        getNeeded: () => number,
        decrementNeeded: () => void
      ) => {
        let needed = getNeeded();
        if (needed <= 0) return;

        let assignedCount = 0;
        const {startTime, endTime, notesSuffix} = getShiftDetails(shiftType);
        
        const maxWorkDays = service.consecutivenessRules?.maxConsecutiveWorkDays || 7;
        // Min rest days *before* starting a new work block.
        // This could be 0 or 1 if it's just a continuation of work days,
        // or a higher number if they *must* have had preferred/max rest days.
        // For now, let's assume min 1 rest day if they were previously resting.
        const minRestDaysRequired = (service.consecutivenessRules?.minConsecutiveDaysOffRequiredBeforeWork || 1);


        const availableForWork = employeesForService
            .filter(emp => !dailyProcessedEmployees.has(emp.id) && !dailyAssignedWorkShifts.has(emp.id))
            .filter(emp => {
                const state = employeeStates[emp.id];
                const canStartWork = state.lastShiftType === 'D' || state.lastShiftType === 'C' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === undefined
                    ? state.consecutiveRestDays >= minRestDaysRequired
                    : true; // Already working, check consecutiveWorkDays
                return state.consecutiveWorkDays < maxWorkDays && canStartWork;
            })
            .sort((a, b) => { // Prioritize
                const stateA = employeeStates[a.id];
                const stateB = employeeStates[b.id];
                // 1. Prefer employees who need to break a long rest streak (if preferredConsecutiveDaysOff is met)
                if (service.consecutivenessRules?.preferredConsecutiveDaysOff) {
                    if (stateA.consecutiveRestDays >= service.consecutivenessRules.preferredConsecutiveDaysOff && stateB.consecutiveRestDays < service.consecutivenessRules.preferredConsecutiveDaysOff) return -1;
                    if (stateB.consecutiveRestDays >= service.consecutivenessRules.preferredConsecutiveDaysOff && stateA.consecutiveRestDays < service.consecutivenessRules.preferredConsecutiveDaysOff) return 1;
                }
                // 2. Load balancing
                if (stateA.shiftsThisMonth !== stateB.shiftsThisMonth) return stateA.shiftsThisMonth - stateB.shiftsThisMonth;
                // 3. Prefer those who have worked fewer consecutive days (to allow longer blocks if possible)
                if (stateA.consecutiveWorkDays !== stateB.consecutiveWorkDays) return stateA.consecutiveWorkDays - stateB.consecutiveWorkDays;
                // 4. Prefer weekend workers if it's a weekend/holiday (and they haven't worked too much)
                if (useWeekendHolidayStaffing) {
                    const prefersA = a.preferences?.prefersWeekendWork ?? false;
                    const prefersB = b.preferences?.prefersWeekendWork ?? false;
                    if (prefersA && !prefersB) return -1;
                    if (!prefersA && prefersB) return 1;
                }
                return 0;
            });

        for (const emp of availableForWork) {
          if (assignedCount >= needed) break;
          const state = employeeStates[emp.id];
          generatedShifts.push({
            date: currentDateStrYYYYMMDD,
            employeeName: emp.name,
            serviceName: service.name,
            startTime: startTime,
            endTime: endTime,
            notes: `${format(currentDate, 'EEEE', { locale: es })} ${notesSuffix}`,
          });
          dailyAssignedWorkShifts.add(emp.id);
          dailyProcessedEmployees.add(emp.id);
          state.shiftsThisMonth++;
          state.consecutiveWorkDays = (state.lastShiftType === 'M' || state.lastShiftType === 'T' || state.lastShiftType === 'N') ? state.consecutiveWorkDays + 1 : 1;
          state.consecutiveRestDays = 0;
          state.lastShiftType = shiftType;
          decrementNeeded();
          needed = getNeeded(); // update needed count after decrement
          assignedCount++;
        }
      };

    assignShiftsForType('M', () => staffingNeeds.morning, () => staffingNeeds.morning--);
    assignShiftsForType('T', () => staffingNeeds.afternoon, () => staffingNeeds.afternoon--);
    if (service.enableNightShift) {
      assignShiftsForType('N', () => staffingNeeds.night, () => staffingNeeds.night--);
    }

    // Paso 4: Asignar Descansos ('D')
    employeesForService.forEach(emp => {
        const state = employeeStates[emp.id];
        if (!dailyProcessedEmployees.has(emp.id)) {
            generatedShifts.push({
                date: currentDateStrYYYYMMDD,
                employeeName: emp.name,
                serviceName: service.name,
                startTime: '',
                endTime: '',
                notes: 'D (Descanso)',
            });
            dailyProcessedEmployees.add(emp.id);
            state.consecutiveRestDays = (state.lastShiftType === 'D' || state.lastShiftType === 'LAO' || state.lastShiftType === 'LM' || state.lastShiftType === 'C' || state.lastShiftType === undefined) ? state.consecutiveRestDays + 1 : 1;
            state.consecutiveWorkDays = 0;
            state.lastShiftType = 'D';
        }
    });

    // TODO: Paso 5: Franco Post-Guardia (D/D) logic
  }

  const monthName = format(new Date(yearInt, monthInt - 1), 'MMMM yyyy', { locale: es });
  return {
    generatedShifts,
    responseText: `Horario generado algorítmicamente para ${service.name} para ${monthName}. Se crearon ${generatedShifts.length} turnos. (Lógica de consecutividad y preferencias parcialmente implementada).`,
  };
}
    

    