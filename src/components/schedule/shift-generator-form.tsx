
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, CalendarDays, Eye, Bot, Info } from 'lucide-react';
import { generateAlgorithmicSchedule } from '@/lib/scheduler/algorithmic-scheduler';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Employee, Service, FixedAssignment } from '@/lib/types';
import { format, isValid, parseISO, isWithinInterval, startOfMonth, endOfMonth, getYear as getYearFromDate, getMonth as getMonthFromDate } from 'date-fns';
import { es } from 'date-fns/locale';
import InteractiveScheduleGrid from './InteractiveScheduleGrid';

const shiftGenerationConfigSchema = z.object({
  serviceId: z.string().min(1, "Debe seleccionar un servicio."),
  month: z.string().min(1, "Debe seleccionar un mes."),
  year: z.string().min(1, "Debe seleccionar un año."),
});

type ShiftGenerationConfigFormData = z.infer<typeof shiftGenerationConfigSchema>;

interface ShiftGeneratorFormProps {
  onSaveShifts: (aiShifts: AIShift[]) => Promise<{ successCount: number; errorCount: number }>;
  allEmployees: Employee[];
  allServices: Service[];
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());
const months = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString(),
  label: format(new Date(currentYear, i), 'MMMM', { locale: es }),
}));

// TEMPORAL: Lista de feriados. Eventualmente, esto debería venir de Firebase y ser editable por el usuario.
// Usar formato YYYY-MM-DD
const TEMP_HOLIDAYS: Array<{ date: string; name: string }> = [
    { date: `${currentYear}-01-01`, name: "Año Nuevo" },
    { date: `${currentYear}-05-01`, name: "Día del Trabajador" },
    { date: `${currentYear}-07-09`, name: "Día de la Independencia" },
    { date: `${currentYear}-12-25`, name: "Navidad" },
    // Añadir más feriados relevantes para el año actual o próximos si es necesario
    { date: `${currentYear + 1}-01-01`, name: "Año Nuevo" },
];


export default function ShiftGeneratorForm({ onSaveShifts, allEmployees, allServices }: ShiftGeneratorFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedResponseText, setGeneratedResponseText] = useState<string | null>(null);
  const [algorithmGeneratedShifts, setAlgorithmGeneratedShifts] = useState<AIShift[] | null>(null);
  const [editableShifts, setEditableShifts] = useState<AIShift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [displayInfoText, setDisplayInfoText] = useState<string>("");


  const form = useForm<ShiftGenerationConfigFormData>({
    resolver: zodResolver(shiftGenerationConfigSchema),
    defaultValues: {
      serviceId: allServices.length > 0 ? allServices[0].id : '',
      month: (new Date().getMonth() + 1).toString(),
      year: new Date().getFullYear().toString(),
    },
  });

  const selectedServiceId = form.watch('serviceId');
  const selectedMonth = form.watch('month'); // string "1" a "12"
  const selectedYear = form.watch('year');   // string "2024"
  
  const selectedService = useMemo(() => {
    return allServices.find(s => s.id === selectedServiceId);
  }, [selectedServiceId, allServices]);

  useEffect(() => {
    if (selectedService && selectedMonth && selectedYear && allEmployees) {
      const monthIdx = parseInt(selectedMonth, 10) -1; // 0-11 for Date constructor
      const yearInt = parseInt(selectedYear, 10);
      
      const monthDate = new Date(yearInt, monthIdx, 1);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const targetInterval = { start: monthStart, end: monthEnd };

      let info = `Resumen para generar horario para el servicio: ${selectedService.name}\n`;
      info += `Mes: ${months.find(m => m.value === selectedMonth)?.label || selectedMonth}, Año: ${selectedYear}\n\n`;
      
      info += "Reglas del Servicio:\n";
      info += `- Dotación Días de Semana: Mañana=${selectedService.staffingNeeds.morningWeekday}, Tarde=${selectedService.staffingNeeds.afternoonWeekday}${selectedService.enableNightShift ? `, Noche=${selectedService.staffingNeeds.nightWeekday}` : ''}\n`;
      info += `- Dotación Fin de Semana/Feriados: Mañana=${selectedService.staffingNeeds.morningWeekendHoliday}, Tarde=${selectedService.staffingNeeds.afternoonWeekendHoliday}${selectedService.enableNightShift ? `, Noche=${selectedService.staffingNeeds.nightWeekendHoliday}` : ''}\n`;
      info += `- Turno Noche (N) Habilitado: ${selectedService.enableNightShift ? 'Sí' : 'No'}\n`;
      if (selectedService.consecutivenessRules) {
        info += `- Consecutividad Trabajo: Máx=${selectedService.consecutivenessRules.maxConsecutiveWorkDays}, Pref=${selectedService.consecutivenessRules.preferredConsecutiveWorkDays}\n`;
        info += `- Consecutividad Descanso: Máx=${selectedService.consecutivenessRules.maxConsecutiveDaysOff}, Pref=${selectedService.consecutivenessRules.preferredConsecutiveDaysOff}\n`;
      }
      if (selectedService.additionalNotes) {
        info += `- Notas Adicionales del Servicio: ${selectedService.additionalNotes}\n`;
      }
      info += "\n";

      const holidaysInMonth = TEMP_HOLIDAYS.filter(h => {
        const holidayDate = parseISO(h.date);
        return isValid(holidayDate) && getYearFromDate(holidayDate) === yearInt && getMonthFromDate(holidayDate) === monthIdx;
      });

      if (holidaysInMonth.length > 0) {
        info += `Feriados en ${months.find(m => m.value === selectedMonth)?.label || selectedMonth} ${selectedYear}:\n`;
        holidaysInMonth.forEach(h => {
            info += `  - ${format(parseISO(h.date), 'dd/MM/yyyy')}: ${h.name}\n`;
        });
        info += "\n";
      }


      const employeesInService = allEmployees.filter(emp => emp.serviceIds.includes(selectedService.id));
      info += `Empleados Asignados a ${selectedService.name} (${employeesInService.length}):\n`;
      if (employeesInService.length === 0) {
        info += "- Ninguno\n";
      } else {
        employeesInService.forEach(emp => {
          info += `\n- ${emp.name} (Roles: ${emp.roles.join(', ') || 'N/A'})\n`;
          if (emp.preferences) {
            info += `  - Prefiere FDS: ${emp.preferences.prefersWeekendWork ? 'Sí' : 'No'}\n`;
            info += `  - Elegible D/D: ${emp.preferences.eligibleForDayOffAfterDuty ? 'Sí' : 'No'}\n`;
            if (emp.preferences.fixedWeeklyShiftDays && emp.preferences.fixedWeeklyShiftDays.length > 0) {
              info += `  - Turno Fijo Semanal: Días=[${emp.preferences.fixedWeeklyShiftDays.join(', ')}], Horario=${emp.preferences.fixedWeeklyShiftTiming || 'No especificado'}\n`;
            }
          }
          const relevantAssignments = (emp.fixedAssignments || []).filter(assign => {
            if (!assign.startDate) return false;
            const assignmentStartDate = parseISO(assign.startDate);
            // For single day assignments (like 'D'), endDate might be undefined. Use startDate as endDate.
            const assignmentEndDate = assign.endDate ? parseISO(assign.endDate) : assignmentStartDate;
            
            if (!isValid(assignmentStartDate) || !isValid(assignmentEndDate)) return false;
            
            // Check if the assignment's interval overlaps with the target month's interval
            const currentAssignmentInterval = { start: assignmentStartDate, end: assignmentEndDate };
            return isWithinInterval(assignmentStartDate, targetInterval) || 
                   isWithinInterval(assignmentEndDate, targetInterval) ||
                   (assignmentStartDate < monthStart && assignmentEndDate > monthEnd);
          });

          if (relevantAssignments.length > 0) {
            info += `  - Asignaciones Fijas en ${months.find(m => m.value === selectedMonth)?.label || selectedMonth}:\n`;
            relevantAssignments.forEach(assign => {
              const startDateFormatted = format(parseISO(assign.startDate), 'dd/MM/yyyy');
              const endDateFormatted = assign.endDate ? format(parseISO(assign.endDate), 'dd/MM/yyyy') : startDateFormatted;
              info += `    - ${assign.type}: ${startDateFormatted}${assign.endDate && assign.endDate !== assign.startDate ? ' a ' + endDateFormatted : ''} ${assign.description ? '('+assign.description+')' : ''}\n`;
            });
          }
        });
      }
      setDisplayInfoText(info);
    } else {
      setDisplayInfoText("Seleccione un servicio, mes y año para ver el resumen.");
    }
  }, [selectedServiceId, selectedMonth, selectedYear, allServices, allEmployees, selectedService]);


  const handleGenerateSubmit = async (data: ShiftGenerationConfigFormData) => {
    if (!selectedService) {
        setError("Por favor, seleccione un servicio válido.");
        return;
    }
    setIsGenerating(true);
    setGeneratedResponseText(null);
    setAlgorithmGeneratedShifts(null);
    setEditableShifts(null);
    setError(null);
    setShowGrid(false);
    try {
      // Pass the TEMP_HOLIDAYS to the algorithm
      const result = await generateAlgorithmicSchedule(
        selectedService,
        data.month,
        data.year,
        allEmployees,
        TEMP_HOLIDAYS 
      );
      setGeneratedResponseText(result.responseText);
      if (result.generatedShifts && result.generatedShifts.length > 0) {
        setAlgorithmGeneratedShifts(result.generatedShifts);
        setEditableShifts(result.generatedShifts); 
      } else if (!result.responseText?.toLowerCase().includes("error") && (!result.generatedShifts || result.generatedShifts.length === 0)) {
        setError("El algoritmo generó una respuesta pero no se encontraron turnos estructurados. Revise el texto de respuesta.");
      } else if (result.responseText?.toLowerCase().includes("error") || result.generatedShifts.length === 0) {
         setError(`Respuesta del algoritmo: ${result.responseText}`);
      }
    } catch (e) {
      console.error("Error generando el horario con el algoritmo:", e);
      setError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante la generación algorítmica del horario.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveGeneratedShifts = async () => {
    if (!editableShifts || editableShifts.length === 0) {
      setError("No hay turnos para guardar.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSaveShifts(editableShifts);
    } catch (e) {
       console.error("Error guardando los turnos:", e);
       setError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante el guardado de los turnos.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToConfig = () => {
    setShowGrid(false);
  };

  return (
    <Card className="w-full">
      {!showGrid ? (
        <>
          <CardHeader>
            <CardTitle className="font-headline flex items-center">
              <Bot className="mr-2 h-6 w-6 text-primary" />
              Generador de Turnos Algorítmico
            </CardTitle>
            <CardDescription>
              Seleccione el servicio, mes y año. El horario se generará automáticamente
              basado en las reglas del servicio y la disponibilidad de empleados.
            </CardDescription>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleGenerateSubmit)}>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="serviceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Servicio</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isGenerating}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccione un servicio" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {allServices.map(service => (
                              <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="month"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mes</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isGenerating}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un mes" /></SelectTrigger></FormControl>
                          <SelectContent>{months.map(m => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Año</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isGenerating}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un año" /></SelectTrigger></FormControl>
                          <SelectContent>{years.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormItem>
                  <FormLabel className="flex items-center"><Info className="mr-2 h-4 w-4 text-primary" /> Información para Generación</FormLabel>
                  <Textarea
                    value={displayInfoText}
                    readOnly
                    rows={10}
                    className="min-h-[150px] font-mono text-xs bg-muted/30 border-dashed"
                    placeholder="Seleccione servicio, mes y año para ver el resumen..."
                  />
                </FormItem>

              </CardContent>
              <CardFooter className="flex flex-col items-stretch gap-4">
                <Button type="submit" disabled={isGenerating || isSaving || !selectedServiceId} className="w-full">
                  {isGenerating ? (
                    <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando Horario... </>
                  ) : (
                    <> <CalendarDays className="mr-2 h-4 w-4" /> Generar Horario para {selectedService?.name || ''} </>
                  )}
                </Button>
                 {generatedResponseText && !showGrid && ( 
                    <Card className="mt-4 w-full border-dashed">
                        <CardHeader className="pb-2 pt-4"><CardTitle className="text-base">Respuesta del Algoritmo</CardTitle></CardHeader>
                        <CardContent>
                        <Textarea value={generatedResponseText} readOnly rows={3} className="min-h-[60px] font-mono text-xs bg-muted/30"/>
                        </CardContent>
                    </Card>
                )}
              </CardFooter>
            </form>
          </Form>
        </>
      ) : (
        editableShifts && selectedMonth && selectedYear && (
          <InteractiveScheduleGrid
            initialShifts={editableShifts}
            allEmployees={allEmployees}
            targetService={selectedService}
            month={selectedMonth}
            year={selectedYear}
            onShiftsChange={(updatedShifts) => setEditableShifts(updatedShifts)}
            onBackToConfig={handleBackToConfig}
          />
        )
      )}

      {error && (
        <Alert variant="destructive" className="mt-4 mx-6 mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showGrid && editableShifts && editableShifts.length > 0 && (
        <CardFooter className="flex flex-col items-stretch gap-4 pt-6">
            <Button onClick={handleSaveGeneratedShifts} disabled={isSaving || isGenerating} className="w-full">
            {isSaving ? (
                <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando {editableShifts.length} Turno(s)... </>
            ) : (
                <> <Save className="mr-2 h-4 w-4" /> Guardar {editableShifts.length} Turno(s) del Horario Editado </>
            )}
            </Button>
        </CardFooter>
      )}
       {!showGrid && generatedResponseText && algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0 && (
         <CardFooter className="flex flex-col items-stretch gap-4 pt-0">
            <Button onClick={() => setShowGrid(true)} variant="outline" className="w-full">
                <Eye className="mr-2 h-4 w-4" /> Ver y Editar Horario Interactivo ({algorithmGeneratedShifts.length} turnos)
            </Button>
         </CardFooter>
      )}
    </Card>
  );
}
