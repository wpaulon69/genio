
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule';
import type { Employee, Service } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { format, getDaysInMonth, getDate, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft } from 'lucide-react';
import { SHIFT_OPTIONS, type GridShiftType, type ShiftOption } from '@/lib/constants/schedule-constants';


export function getGridShiftTypeFromAIShift(aiShift: AIShift | null | undefined): GridShiftType {
  if (!aiShift) return '';

  const note = aiShift.notes?.toUpperCase();

  if (note === 'D' || note === 'D (DESCANSO)' || note?.includes('DESCANSO')) return 'D';
  if (note === 'C' || note === 'C (FRANCO COMP.)' || note?.includes('FRANCO COMP')) return 'C';
  if (note?.startsWith('LAO')) return 'LAO';
  if (note?.startsWith('LM')) return 'LM';

  if (aiShift.startTime) {
    if (aiShift.startTime.startsWith('07:') || aiShift.startTime.startsWith('08:')) return 'M';
    if (aiShift.startTime.startsWith('14:') || aiShift.startTime.startsWith('15:')) return 'T';
    if (aiShift.startTime.startsWith('22:') || aiShift.startTime.startsWith('23:')) return 'N';
  }
  
  if (aiShift.startTime && aiShift.endTime) {
    if (note?.includes('MAÑANA') || note?.includes('(M)')) return 'M';
    if (note?.includes('TARDE') || note?.includes('(T)')) return 'T';
    if (note?.includes('NOCHE') || note?.includes('(N)')) return 'N';
  }
  
  return ''; 
}


interface InteractiveScheduleGridProps {
  initialShifts: AIShift[];
  allEmployees: Employee[];
  targetService: Service | undefined;
  month: string; 
  year: string; 
  onShiftsChange?: (updatedShifts: AIShift[]) => void;
  onBackToConfig?: () => void;
  isReadOnly?: boolean;
}

export default function InteractiveScheduleGrid({
  initialShifts,
  allEmployees,
  targetService,
  month,
  year,
  onShiftsChange,
  onBackToConfig,
  isReadOnly = false,
}: InteractiveScheduleGridProps) {
  const [editableShifts, setEditableShifts] = useState<AIShift[]>([...initialShifts]);

  useEffect(() => {
    // Ensure editableShifts gets updated if initialShifts prop changes from parent
    // This is important if the parent component re-fetches or re-generates shifts.
    setEditableShifts([...initialShifts]);
  }, [initialShifts]);


  const monthDate = useMemo(() => {
    // Ensure month is parsed correctly (e.g., "1" for January, "12" for December)
    const monthIndex = parseInt(month, 10) -1;
    if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
        // Handle invalid month, e.g., return current date or throw error
        console.error("Invalid month provided to InteractiveScheduleGrid:", month);
        return new Date(); // Fallback
    }
    return new Date(parseInt(year), monthIndex, 1);
  }, [month, year]);

  const daysInMonth = useMemo(() => getDaysInMonth(monthDate), [monthDate]);

  const dayHeaders = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = new Date(parseInt(year), parseInt(month) - 1, day);
      return {
        dayNumber: day,
        shortName: format(date, 'eee', { locale: es }), 
      };
    });
  }, [daysInMonth, month, year]);

  const relevantEmployeeNames = useMemo(() => {
    const names = new Set<string>();
    // Add names from the current set of shifts being displayed/edited
    editableShifts.forEach(s => names.add(s.employeeName));
    
    // If a target service is specified, ensure all employees assigned to that service are included,
    // even if they don't have shifts yet in the current `editableShifts`.
    if (targetService) {
        allEmployees.forEach(emp => {
            if (emp.serviceIds.includes(targetService.id)) {
                names.add(emp.name);
            }
        });
    } else if (editableShifts.length === 0 && allEmployees.length > 0) {
        // If no target service and no initial shifts, but we have allEmployees,
        // it implies we might be in a state where we want to show all employees (e.g. for manual creation on empty grid)
        // However, without a targetService, it's hard to filter. This case might need refinement based on usage.
        // For now, if targetService is undefined, only employees from initialShifts are guaranteed.
    }
    return Array.from(names).sort((a,b) => a.localeCompare(b));
  }, [editableShifts, allEmployees, targetService]);


  const gridData = useMemo(() => {
    const data: { [employeeName: string]: { [day: number]: AIShift | null } } = {};
    relevantEmployeeNames.forEach(name => data[name] = {});

    editableShifts.forEach(shift => {
      if (!shift.date || !shift.employeeName) return; 
      // Ensure shift.date is valid before parsing
      const parsedShiftDate = parse(shift.date, 'yyyy-MM-dd', new Date());
      if (!isValid(parsedShiftDate)) return;

      // Ensure month and year from props are valid before formatting them for comparison
      const currentDisplayMonth = parseInt(month, 10);
      const currentDisplayYear = parseInt(year, 10);
      if (isNaN(currentDisplayMonth) || isNaN(currentDisplayYear)) return;

      if (format(parsedShiftDate, 'M') === month && format(parsedShiftDate, 'yyyy') === year) {
        const dayOfMonth = getDate(parsedShiftDate);
        if (!data[shift.employeeName]) {
          data[shift.employeeName] = {}; 
        }
        data[shift.employeeName][dayOfMonth] = shift;
      }
    });
    return data;
  }, [editableShifts, relevantEmployeeNames, month, year]);

  const handleShiftChange = (employeeName: string, day: number, selectedShiftValue: GridShiftType) => {
    if (isReadOnly || !onShiftsChange) return;

    const newShifts = [...editableShifts];
    const shiftDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existingShiftIndex = newShifts.findIndex(
      s => s.employeeName === employeeName && s.date === shiftDateStr
    );

    const selectedOption = SHIFT_OPTIONS.find(opt => opt.value === selectedShiftValue);

    if (selectedShiftValue === '') { 
      if (existingShiftIndex !== -1) {
        newShifts.splice(existingShiftIndex, 1);
      }
    } else if (selectedOption) {
      const serviceName = targetService?.name || (existingShiftIndex !== -1 ? newShifts[existingShiftIndex]?.serviceName : '') || 'Servicio Desconocido';
      
      const newOrUpdatedShift: AIShift = {
        date: shiftDateStr,
        employeeName: employeeName,
        serviceName: serviceName,
        startTime: selectedOption.startTime || '', 
        endTime: selectedOption.endTime || '',   
        notes: (selectedOption.value === 'D' || selectedOption.value === 'C' || selectedOption.value === 'LAO' || selectedOption.value === 'LM') 
                ? selectedOption.label 
                : `Turno ${selectedOption.label}`, 
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

  const dailyTotals = useMemo(() => {
    const totals: { [day: number]: { M: number; T: number; N: number; D: number; C: number; LAO: number; LM: number; totalStaff: number } } = {};
    dayHeaders.forEach(header => {
      totals[header.dayNumber] = { M: 0, T: 0, N: 0, D:0, C:0, LAO:0, LM:0, totalStaff: 0 };
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

          if (['M', 'T', 'N'].includes(shiftType)) {
            totals[header.dayNumber].totalStaff++;
          }
        }
      });
    });
    return totals;
  }, [gridData, dayHeaders, relevantEmployeeNames]);


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
          <Table className="min-w-max">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 w-[180px] min-w-[180px] max-w-[180px] truncate">Empleado</TableHead>
                {dayHeaders.map(header => (
                  <TableHead key={header.dayNumber} className="text-center w-[70px] min-w-[70px]">
                    <div>{header.dayNumber}</div>
                    <div className="text-xs text-muted-foreground">{header.shortName}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {relevantEmployeeNames.map(employeeName => (
                <TableRow key={employeeName}>
                  <TableCell className="sticky left-0 bg-card z-10 font-medium w-[180px] min-w-[180px] max-w-[180px] truncate" title={employeeName}>{employeeName}</TableCell>
                  {dayHeaders.map(header => {
                    const shift = gridData[employeeName]?.[header.dayNumber];
                    const currentShiftType = getGridShiftTypeFromAIShift(shift);
                    return (
                      <TableCell key={`${employeeName}-${header.dayNumber}`} className="p-1 w-[70px] min-w-[70px]">
                        <Select
                          value={currentShiftType} 
                          onValueChange={(value) => handleShiftChange(employeeName, header.dayNumber, value as GridShiftType)}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger className="h-8 w-full text-xs px-2">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            {SHIFT_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell className="sticky left-0 bg-muted/50 z-10 w-[180px] min-w-[180px] max-w-[180px] truncate">Total Mañana (M)</TableCell>
                {dayHeaders.map(header => <TableCell key={`total-m-${header.dayNumber}`} className="text-center">{dailyTotals[header.dayNumber].M}</TableCell>)}
              </TableRow>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell className="sticky left-0 bg-muted/50 z-10 w-[180px] min-w-[180px] max-w-[180px] truncate">Total Tarde (T)</TableCell>
                {dayHeaders.map(header => <TableCell key={`total-t-${header.dayNumber}`} className="text-center">{dailyTotals[header.dayNumber].T}</TableCell>)}
              </TableRow>
              {targetService?.enableNightShift && (
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="sticky left-0 bg-muted/50 z-10 w-[180px] min-w-[180px] max-w-[180px] truncate">Total Noche (N)</TableCell>
                  {dayHeaders.map(header => <TableCell key={`total-n-${header.dayNumber}`} className="text-center">{dailyTotals[header.dayNumber].N}</TableCell>)}
                </TableRow>
              )}
              <TableRow className="bg-muted/50 font-bold text-base">
                <TableCell className="sticky left-0 bg-muted/50 z-10 w-[180px] min-w-[180px] max-w-[180px] truncate">TOTAL PERSONAL</TableCell>
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
