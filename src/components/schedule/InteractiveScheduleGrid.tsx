
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


// Helper para mapear un AIShift completo a un GridShiftType para visualización
export function getGridShiftTypeFromAIShift(aiShift: AIShift | null | undefined): GridShiftType {
  if (!aiShift) return '';

  const note = aiShift.notes?.toUpperCase();
  // Primero chequear notas específicas para D, LAO, LM, C
  if (note === 'D' || note === 'D (DESCANSO)' || note?.includes('DESCANSO')) return 'D';
  if (note === 'C' || note === 'C (FRANCO COMP.)' || note?.includes('FRANCO COMP')) return 'C';
  if (note?.startsWith('LAO')) return 'LAO';
  if (note?.startsWith('LM')) return 'LM';

  // Luego, coincidencia basada en la hora de inicio para M, T, N
  if (aiShift.startTime) {
    if (aiShift.startTime.startsWith('07:') || aiShift.startTime.startsWith('08:')) return 'M';
    if (aiShift.startTime.startsWith('14:') || aiShift.startTime.startsWith('15:')) return 'T';
    if (aiShift.startTime.startsWith('22:') || aiShift.startTime.startsWith('23:')) return 'N';
  }
  
  // Si tiene horas pero no coincide con M, T, N por hora, y no es una nota especial,
  // podríamos revisar si la nota incluye M, T, N (como fallback)
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
  month: string; // "1" a "12"
  year: string; // "2024", "2025", etc.
  onShiftsChange: (updatedShifts: AIShift[]) => void;
  onBackToConfig: () => void;
}

export default function InteractiveScheduleGrid({
  initialShifts,
  allEmployees,
  targetService,
  month,
  year,
  onShiftsChange,
  onBackToConfig,
}: InteractiveScheduleGridProps) {
  const [editableShifts, setEditableShifts] = useState<AIShift[]>([...initialShifts]);

  useEffect(() => {
    setEditableShifts([...initialShifts]);
  }, [initialShifts]);

  const monthDate = useMemo(() => {
    return parse(`${year}-${month}-01`, 'yyyy-M-dd', new Date());
  }, [month, year]);

  const daysInMonth = useMemo(() => getDaysInMonth(monthDate), [monthDate]);

  const dayHeaders = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = new Date(parseInt(year), parseInt(month) - 1, day);
      return {
        dayNumber: day,
        shortName: format(date, 'eee', { locale: es }), // Usar 'eee' para abreviatura de 3 letras
      };
    });
  }, [daysInMonth, month, year]);

  const relevantEmployeeNames = useMemo(() => {
    const namesFromShifts = new Set(editableShifts.map(s => s.employeeName));
    if (targetService) {
        allEmployees.forEach(emp => {
            if (emp.serviceIds.includes(targetService.id)) {
                namesFromShifts.add(emp.name);
            }
        });
    }
    return Array.from(namesFromShifts).sort((a,b) => a.localeCompare(b));
  }, [editableShifts, allEmployees, targetService]);


  const gridData = useMemo(() => {
    const data: { [employeeName: string]: { [day: number]: AIShift | null } } = {};
    relevantEmployeeNames.forEach(name => data[name] = {});

    editableShifts.forEach(shift => {
      if (!shift.date || !shift.employeeName) return; 
      const shiftDate = parse(shift.date, 'yyyy-MM-dd', new Date());
      if (isValid(shiftDate) && format(shiftDate, 'M') === month && format(shiftDate, 'yyyy') === year) {
        const dayOfMonth = getDate(shiftDate);
        if (!data[shift.employeeName]) {
          data[shift.employeeName] = {}; 
        }
        data[shift.employeeName][dayOfMonth] = shift;
      }
    });
    return data;
  }, [editableShifts, relevantEmployeeNames, month, year]);

  const handleShiftChange = (employeeName: string, day: number, selectedShiftValue: GridShiftType) => {
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
                ? selectedOption.label // Para D, C, LAO, LM usar la etiqueta como nota
                : `Turno ${selectedOption.label}`, // Para M, T, N
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
                <CardTitle>Horario Generado</CardTitle>
            </CardHeader>
            <CardContent>
                <p>No se han generado turnos o no hay un servicio específico seleccionado para mostrar. Vuelva a la configuración y genere un horario.</p>
                 <Button onClick={onBackToConfig} variant="outline" className="mt-4">
                    <ChevronLeft className="mr-2 h-4 w-4" /> Volver a Configuración
                </Button>
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
                Horario Interactivo: {targetService?.name || "Turnos Generados"} - {monthName} {currentYearStr}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
                Puede editar los turnos manualmente. Los cambios se reflejan para guardar. Use '-' para vaciar una celda.
            </p>
        </div>
        <Button onClick={onBackToConfig} variant="outline">
          <ChevronLeft className="mr-2 h-4 w-4" /> Volver a Configuración
        </Button>
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
