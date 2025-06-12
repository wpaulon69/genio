
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule';
import type { Employee, Service, Holiday, InteractiveScheduleGridProps } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { format, getDaysInMonth, getDate, parse, isValid, getDay as getDayOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft } from 'lucide-react';
import { SHIFT_OPTIONS, type GridShiftType, type ShiftOption } from '@/lib/constants/schedule-constants';
import { cn } from '@/lib/utils';

/**
 * Convierte un objeto `AIShift` (potencialmente de la IA o guardado) al tipo de turno (`GridShiftType`)
 * que se utiliza en la grilla interactiva para la selección y visualización.
 * Se basa en las notas del turno (`notes`) y, secundariamente, en `startTime`.
 *
 * @param {AIShift | null | undefined} aiShift - El turno de entrada.
 * @returns {GridShiftType} El tipo de turno para la grilla (ej. 'M', 'T', 'N', 'D', 'LAO', etc.).
 */
export function getGridShiftTypeFromAIShift(aiShift: AIShift | null | undefined): GridShiftType {
  if (!aiShift) return '';

  const note = aiShift.notes?.toUpperCase();

  // Prioriza notas específicas para tipos no laborables
  if (note === 'C' || note === 'C (FRANCO COMP.)' || note?.includes('FRANCO COMP')) return 'C';
  if (note?.startsWith('F') || note?.includes('FERIADO')) return 'F';
  if (note === 'D' || note === 'D (DESCANSO)' || note?.includes('DESCANSO') || note === 'D (FIJO SEMANAL)' || note === 'D (FDS OBJETIVO)') return 'D';
  if (note?.startsWith('LAO')) return 'LAO';
  if (note?.startsWith('LM')) return 'LM';

  // Si hay startTime, intenta inferir M, T, N
  if (aiShift.startTime) {
    if (aiShift.startTime.startsWith('07:') || aiShift.startTime.startsWith('08:')) return 'M';
    if (aiShift.startTime.startsWith('14:') || aiShift.startTime.startsWith('15:')) return 'T';
    if (aiShift.startTime.startsWith('22:') || aiShift.startTime.startsWith('23:')) return 'N';
  }
  
  // Como fallback, si hay startTime y endTime, revisa las notas por indicadores M, T, N
  if (aiShift.startTime && aiShift.endTime) {
    if (note?.includes('MAÑANA') || note?.includes('(M)')) return 'M';
    if (note?.includes('TARDE') || note?.includes('(T)')) return 'T';
    if (note?.includes('NOCHE') || note?.includes('(N)')) return 'N';
  }
  
  return ''; // Retorna vacío si no se puede determinar
}

/**
 * Obtiene la clase CSS de Tailwind para el color de fondo de una celda de turno.
 * @param {GridShiftType} shiftType - El tipo de turno (ej. 'M', 'T', 'D').
 * @returns {string} La clase CSS correspondiente.
 */
const getShiftCellColorClass = (shiftType: GridShiftType): string => {
  switch (shiftType) {
    case 'M': return 'shift-m';
    case 'T': return 'shift-t';
    case 'N': return 'shift-n';
    case 'D': return 'shift-d';
    case 'F': return 'shift-f';
    case 'C': return 'shift-c';
    case 'LAO': return 'shift-lao';
    case 'LM': return 'shift-lm';
    case '_EMPTY_':
    case '':
    default:
      return 'shift-empty';
  }
};


/**
 * `InteractiveScheduleGrid` es un componente que muestra una grilla de horarios editable.
 * Permite a los usuarios ver y modificar los turnos asignados a los empleados para un mes específico y servicio.
 *
 * Características:
 * - Muestra empleados relevantes para el servicio.
 * - Permite cambiar el tipo de turno para cada empleado/día usando un `Select`.
 * - Calcula y muestra totales diarios de personal para turnos M, T, N.
 * - Calcula y muestra el total de días 'D' (Descanso) por empleado.
 * - Resalta días de fin de semana y feriados.
 * - Puede ser de solo lectura (`isReadOnly`).
 * - Notifica los cambios en los turnos a través de `onShiftsChange`.
 *
 * @param {InteractiveScheduleGridProps} props - Las props del componente.
 * @returns {JSX.Element} El elemento JSX que representa la grilla de horarios interactiva.
 */
export default function InteractiveScheduleGrid({
  initialShifts,
  allEmployees,
  targetService,
  month,
  year,
  holidays = [], 
  onShiftsChange,
  onBackToConfig,
  isReadOnly = false,
}: InteractiveScheduleGridProps) { 
  const [editableShifts, setEditableShifts] = useState<AIShift[]>([...initialShifts]);

  /**
   * Efecto para actualizar `editableShifts` si `initialShifts` cambia desde el exterior.
   */
  useEffect(() => {
    setEditableShifts([...initialShifts]);
  }, [initialShifts]);


  /** Memoiza el objeto Date para el primer día del mes/año seleccionado. */
  const monthDate = useMemo(() => {
    const monthIndex = parseInt(month, 10) -1;
    if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
        console.error("Invalid month provided to InteractiveScheduleGrid:", month);
        return new Date(); // Fallback, aunque debería prevenirse antes.
    }
    return new Date(parseInt(year), monthIndex, 1);
  }, [month, year]);

  /** Memoiza el número de días en el mes seleccionado. */
  const daysInMonth = useMemo(() => getDaysInMonth(monthDate), [monthDate]);

  /** Memoiza los encabezados de los días para la grilla (número, nombre corto, si es especial). */
  const dayHeaders = useMemo(() => {
    const holidayDates = new Set(holidays.map(h => h.date)); // Formato YYYY-MM-DD
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = new Date(parseInt(year), parseInt(month) - 1, day);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayOfWeek = getDayOfWeek(date); // 0 (Domingo) a 6 (Sábado)
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHolidayDay = holidayDates.has(dateStr);
      return {
        dayNumber: day,
        shortName: format(date, 'eee', { locale: es }), // ej. "lun", "mar"
        isSpecialDay: isWeekend || isHolidayDay,
      };
    });
  }, [daysInMonth, month, year, holidays]);

  /**
   * Memoiza la lista de nombres de empleados relevantes para el servicio y los turnos actuales.
   * Incluye empleados asignados al `targetService` y cualquier empleado presente en `editableShifts`.
   */
  const relevantEmployeeNames = useMemo(() => {
    const names = new Set<string>();
    editableShifts.forEach(s => names.add(s.employeeName));
    
    if (targetService) {
        allEmployees.forEach(emp => {
            if (emp.serviceIds.includes(targetService.id)) {
                names.add(emp.name);
            }
        });
    }
    return Array.from(names).sort((a,b) => a.localeCompare(b));
  }, [editableShifts, allEmployees, targetService]);


  /**
   * Memoiza la estructura de datos de la grilla, organizada por empleado y día.
   * Facilita el acceso rápido a los turnos.
   */
  const gridData = useMemo(() => {
    const data: { [employeeName: string]: { [day: number]: AIShift | null } } = {};
    relevantEmployeeNames.forEach(name => data[name] = {});

    editableShifts.forEach(shift => {
      if (!shift.date || !shift.employeeName) return; 
      const parsedShiftDate = parse(shift.date, 'yyyy-MM-dd', new Date());
      if (!isValid(parsedShiftDate)) return;

      const currentDisplayMonth = parseInt(month, 10);
      const currentDisplayYear = parseInt(year, 10);
      if (isNaN(currentDisplayMonth) || isNaN(currentDisplayYear)) return;

      // Asegura que solo se procesen turnos del mes y año actual de la vista
      if (parsedShiftDate.getFullYear() === currentDisplayYear && (parsedShiftDate.getMonth() + 1) === currentDisplayMonth) {
        const dayOfMonth = getDate(parsedShiftDate);
        if (!data[shift.employeeName]) {
          data[shift.employeeName] = {}; 
        }
        data[shift.employeeName][dayOfMonth] = shift;
      }
    });
    return data;
  }, [editableShifts, relevantEmployeeNames, month, year]);

 /**
   * Memoiza las estadísticas por empleado (total de días 'D', total de días de trabajo).
   */
 const employeeStats = useMemo(() => {
    const stats: { [employeeName: string]: { totalD: number; totalWork: number; totalAssignments: number } } = {};
    relevantEmployeeNames.forEach(name => {
      stats[name] = { totalD: 0, totalWork: 0, totalAssignments: 0 };
      for (let day = 1; day <= daysInMonth; day++) {
        const shift = gridData[name]?.[day];
        if (shift) {
          stats[name].totalAssignments++;
          const shiftType = getGridShiftTypeFromAIShift(shift);
          if (shiftType === 'D') {
            stats[name].totalD++;
          } else if (['M', 'T', 'N'].includes(shiftType)) {
            stats[name].totalWork++;
          }
        }
      }
    });
    return stats;
  }, [gridData, relevantEmployeeNames, daysInMonth]);


  /**
   * Manejador para cambios en la selección de un turno en la grilla.
   * Actualiza `editableShifts` y llama a `onShiftsChange` si se proporciona.
   *
   * @param {string} employeeName - Nombre del empleado.
   * @param {number} day - Número del día del mes.
   * @param {GridShiftType} selectedShiftValue - El nuevo valor del turno seleccionado.
   */
  const handleShiftChange = (employeeName: string, day: number, selectedShiftValue: GridShiftType) => {
    if (isReadOnly || !onShiftsChange) return;

    const newShifts = [...editableShifts];
    const shiftDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existingShiftIndex = newShifts.findIndex(
      s => s.employeeName === employeeName && s.date === shiftDateStr
    );

    const selectedOption = SHIFT_OPTIONS.find(opt => opt.value === selectedShiftValue);

    if (selectedShiftValue === '_EMPTY_' || !selectedOption) { // Si se selecciona la opción "Vacío" o no válida
      if (existingShiftIndex !== -1) {
        newShifts.splice(existingShiftIndex, 1); // Elimina el turno existente
      }
    } else {
      // Determina el nombre del servicio. Prioriza el del turno existente, luego el targetService, o fallback.
      const serviceName = (existingShiftIndex !== -1 ? newShifts[existingShiftIndex]?.serviceName : targetService?.name) || 'Servicio Desconocido';
      
      const newOrUpdatedShift: AIShift = {
        date: shiftDateStr,
        employeeName: employeeName,
        serviceName: serviceName, // Usa el nombre del servicio determinado
        startTime: selectedOption.startTime || '', 
        endTime: selectedOption.endTime || '',   
        notes: (selectedOption.value === 'D' || selectedOption.value === 'C' || selectedOption.value === 'LAO' || selectedOption.value === 'LM' || selectedOption.value === 'F') 
                ? selectedOption.label // Usar la etiqueta completa para las notas de estos tipos especiales
                : `Turno ${selectedOption.label}`, // Usar la etiqueta completa para M, T, N (ej. "Turno Mañana (M)")
      };

      if (existingShiftIndex !== -1) {
        newShifts[existingShiftIndex] = newOrUpdatedShift;
      } else {
        newShifts.push(newOrUpdatedShift);
      }
    }
    setEditableShifts(newShifts); 
    onShiftsChange(newShifts); 
  };

  /**
   * Memoiza los totales diarios de personal para cada tipo de turno (M, T, N, etc.) y el total de personal de trabajo.
   */
  const dailyTotals = useMemo(() => {
    const totals: { [day: number]: { M: number; T: number; N: number; D: number; C: number; LAO: number; LM: number; F: number; totalStaff: number } } = {};
    dayHeaders.forEach(header => {
      totals[header.dayNumber] = { M: 0, T: 0, N: 0, D:0, C:0, LAO:0, LM:0, F:0, totalStaff: 0 };
    });

    relevantEmployeeNames.forEach(employeeName => {
      dayHeaders.forEach(header => {
        const shift = gridData[employeeName]?.[header.dayNumber];
        if (shift) {
          const shiftType = getGridShiftTypeFromAIShift(shift);
          if (shiftType === 'M') totals[header.dayNumber].M++;
          else if (shiftType === 'T') totals[header.dayNumber].T++;
          else if (shiftType === 'N') totals[header.dayNumber].N++;
          else if (shiftType === 'D') totals[header.dayNumber].D++;
          else if (shiftType === 'C') totals[header.dayNumber].C++;
          else if (shiftType === 'LAO') totals[header.dayNumber].LAO++;
          else if (shiftType === 'LM') totals[header.dayNumber].LM++;
          else if (shiftType === 'F') totals[header.dayNumber].F++;


          // Considera M, T, N como turnos que contribuyen al "totalStaff" de trabajo
          if (['M', 'T', 'N'].includes(shiftType)) {
            totals[header.dayNumber].totalStaff++;
          }
        }
      });
    });
    return totals;
  }, [gridData, dayHeaders, relevantEmployeeNames]);


  // Condición para mostrar mensaje si no hay datos para la grilla
  if (!targetService && initialShifts.length === 0 && relevantEmployeeNames.length === 0) {
    return (
         <Card className="mt-4">
            <CardHeader>
                <CardTitle>Horario</CardTitle>
            </CardHeader>
            <CardContent>
                <p>No se han cargado o generado turnos, o no hay un servicio específico seleccionado para mostrar.</p>
                 {!isReadOnly && onBackToConfig && (
                    <Button onClick={onBackToConfig} variant="outline" className="mt-4">
                        <ChevronLeft className="mr-2 h-4 w-4" /> Volver a Configuración
                    </Button>
                 )}
            </CardContent>
         </Card>
    );
  }
  
  const monthName = format(monthDate, 'MMMM', { locale: es });
  const currentYearStr = format(monthDate, 'yyyy');
  const employeeColumnWidth = "180px"; // Ancho fijo para la columna de empleados
  const totalDColumnWidth = "80px"; // Ancho fijo para la columna "Total D"

  return (
    <Card className="mt-6 w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle className="font-headline">
                Horario: {targetService?.name || "Turnos"} - {monthName} {currentYearStr}
            </CardTitle>
            {!isReadOnly && (
              <p className="text-sm text-muted-foreground">
                  Puede editar los turnos manualmente. Los cambios se reflejan para guardar. Use '-' para vaciar una celda.
              </p>
            )}
             {isReadOnly && (
              <p className="text-sm text-muted-foreground">
                  Vista de solo lectura del horario activo.
              </p>
            )}
        </div>
        {!isReadOnly && onBackToConfig && (
          <Button onClick={onBackToConfig} variant="outline">
            <ChevronLeft className="mr-2 h-4 w-4" /> Volver a Configuración
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {relevantEmployeeNames.length === 0 && (
             <p className="text-muted-foreground">No hay empleados para mostrar para el servicio y mes seleccionados, o no se generaron turnos.</p>
        )}
        {relevantEmployeeNames.length > 0 && (
        <ScrollArea className="w-full whitespace-nowrap rounded-md border">
          <Table className="min-w-max"> {/* min-w-max asegura que la tabla tome el ancho necesario */}
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="sticky left-0 bg-card z-20 truncate" // `truncate` para elipsis si el nombre es muy largo
                  style={{ width: employeeColumnWidth, minWidth: employeeColumnWidth, maxWidth: employeeColumnWidth }}
                >Empleado</TableHead>
                <TableHead 
                  className="sticky bg-card z-20 text-center" // Columna de totales también sticky
                  style={{ left: employeeColumnWidth, width: totalDColumnWidth, minWidth: totalDColumnWidth, maxWidth: totalDColumnWidth }}
                >Total D</TableHead>
                {dayHeaders.map(header => (
                  <TableHead 
                    key={header.dayNumber} 
                    className={cn(
                        "text-center w-[70px] min-w-[70px]", // Ancho fijo para celdas de día
                        header.isSpecialDay && "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300"
                    )}
                    >
                    <div>{header.dayNumber}</div>
                    <div className={cn(
                        "text-xs", 
                        header.isSpecialDay ? "text-pink-600 dark:text-pink-400" : "text-muted-foreground"
                        )}>{header.shortName}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {relevantEmployeeNames.map(employeeName => (
                <TableRow key={employeeName}>
                  <TableCell 
                    className="sticky left-0 bg-card z-10 font-medium truncate" 
                    title={employeeName} // Tooltip con nombre completo por si se trunca
                    style={{ width: employeeColumnWidth, minWidth: employeeColumnWidth, maxWidth: employeeColumnWidth }}
                  >{employeeName}</TableCell>
                  <TableCell 
                    className="sticky bg-card z-10 font-medium text-center"
                    style={{ left: employeeColumnWidth, width: totalDColumnWidth, minWidth: totalDColumnWidth, maxWidth: totalDColumnWidth }}
                  >
                    {employeeStats[employeeName]?.totalD || 0}
                  </TableCell>
                  {dayHeaders.map(header => {
                    const shift = gridData[employeeName]?.[header.dayNumber];
                    const currentShiftType = getGridShiftTypeFromAIShift(shift);
                    const selectedOption = SHIFT_OPTIONS.find(opt => opt.value === currentShiftType);
                    return (
                      <TableCell key={`${employeeName}-${header.dayNumber}`} className="p-1 w-[70px] min-w-[70px]">
                        <Select
                          value={currentShiftType === '' ? "_EMPTY_" : currentShiftType} // Maneja el caso vacío
                          onValueChange={(value) => handleShiftChange(employeeName, header.dayNumber, value as GridShiftType)}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger 
                            className={cn(
                              "h-8 w-full text-xs px-2 font-medium rounded-sm",
                              getShiftCellColorClass(currentShiftType)
                            )}
                          >
                            <SelectValue placeholder="-">
                              { (currentShiftType === '' || currentShiftType === '_EMPTY_' ? SHIFT_OPTIONS.find(opt => opt.value === "_EMPTY_") : selectedOption)
                                ? (currentShiftType === '' || currentShiftType === '_EMPTY_' ? SHIFT_OPTIONS.find(opt => opt.value === "_EMPTY_")!.displayValue : selectedOption!.displayValue)
                                : '-' // Fallback si el tipo de turno no se encuentra
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {SHIFT_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.displayValue} - {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {/* Filas de Totales */}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell 
                  className="sticky left-0 bg-muted/50 z-10 truncate"
                  style={{ width: employeeColumnWidth, minWidth: employeeColumnWidth, maxWidth: employeeColumnWidth }}
                >Total Mañana (M)</TableCell>
                 <TableCell 
                    className="sticky bg-muted/50 z-10" // Celda vacía para alinear con "Total D"
                    style={{ left: employeeColumnWidth, width: totalDColumnWidth, minWidth: totalDColumnWidth, maxWidth: totalDColumnWidth }}
                  ></TableCell>
                {dayHeaders.map(header => <TableCell key={`total-m-${header.dayNumber}`} className="text-center">{dailyTotals[header.dayNumber].M}</TableCell>)}
              </TableRow>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell 
                  className="sticky left-0 bg-muted/50 z-10 truncate"
                   style={{ width: employeeColumnWidth, minWidth: employeeColumnWidth, maxWidth: employeeColumnWidth }}
                >Total Tarde (T)</TableCell>
                 <TableCell 
                    className="sticky bg-muted/50 z-10"
                    style={{ left: employeeColumnWidth, width: totalDColumnWidth, minWidth: totalDColumnWidth, maxWidth: totalDColumnWidth }}
                  ></TableCell>
                {dayHeaders.map(header => <TableCell key={`total-t-${header.dayNumber}`} className="text-center">{dailyTotals[header.dayNumber].T}</TableCell>)}
              </TableRow>
              {targetService?.enableNightShift && (
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell 
                    className="sticky left-0 bg-muted/50 z-10 truncate"
                    style={{ width: employeeColumnWidth, minWidth: employeeColumnWidth, maxWidth: employeeColumnWidth }}
                  >Total Noche (N)</TableCell>
                   <TableCell 
                    className="sticky bg-muted/50 z-10"
                    style={{ left: employeeColumnWidth, width: totalDColumnWidth, minWidth: totalDColumnWidth, maxWidth: totalDColumnWidth }}
                  ></TableCell>
                  {dayHeaders.map(header => <TableCell key={`total-n-${header.dayNumber}`} className="text-center">{dailyTotals[header.dayNumber].N}</TableCell>)}
                </TableRow>
              )}
              <TableRow className="bg-muted/50 font-bold text-base">
                <TableCell 
                  className="sticky left-0 bg-muted/50 z-10 truncate"
                  style={{ width: employeeColumnWidth, minWidth: employeeColumnWidth, maxWidth: employeeColumnWidth }}
                >TOTAL PERSONAL</TableCell>
                 <TableCell 
                    className="sticky bg-muted/50 z-10"
                    style={{ left: employeeColumnWidth, width: totalDColumnWidth, minWidth: totalDColumnWidth, maxWidth: totalDColumnWidth }}
                  ></TableCell>
                {dayHeaders.map(header => <TableCell key={`total-staff-${header.dayNumber}`} className="text-center">{dailyTotals[header.dayNumber].totalStaff}</TableCell>)}
              </TableRow>
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
    
