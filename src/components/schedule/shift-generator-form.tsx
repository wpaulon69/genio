
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
import { Sparkles, Loader2, AlertTriangle, Save, CalendarDays, Eye } from 'lucide-react';
import { suggestShiftSchedule, type SuggestShiftScheduleInput, type SuggestShiftScheduleOutput, type AIShift } from '@/ai/flows/suggest-shift-schedule';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Employee, Service } from '@/lib/types';
import { format, getDaysInMonth, startOfMonth, getDay, parseISO, isWithinInterval, addMonths, subMonths, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import InteractiveScheduleGrid from './InteractiveScheduleGrid'; // Importar el nuevo componente

const shiftPromptSchema = z.object({
  prompt: z.string().min(50, "El prompt debe tener al menos 50 caracteres para proporcionar suficientes detalles para la generación del horario."),
  serviceId: z.string().min(1, "Debe seleccionar un servicio."),
  month: z.string().min(1, "Debe seleccionar un mes."),
  year: z.string().min(1, "Debe seleccionar un año."),
});

type ShiftPromptFormData = z.infer<typeof shiftPromptSchema>;

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

export default function ShiftGeneratorForm({ onSaveShifts, allEmployees, allServices }: ShiftGeneratorFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedResponseText, setGeneratedResponseText] = useState<string | null>(null);
  const [aiGeneratedShifts, setAiGeneratedShifts] = useState<AIShift[] | null>(null);
  const [editableShifts, setEditableShifts] = useState<AIShift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);

  const form = useForm<ShiftPromptFormData>({
    resolver: zodResolver(shiftPromptSchema),
    defaultValues: {
      prompt: "Configure las opciones de servicio, mes y año. El prompt se actualizará automáticamente con los detalles relevantes.",
      serviceId: allServices.length > 0 ? allServices[0].id : '',
      month: (new Date().getMonth() + 1).toString(),
      year: new Date().getFullYear().toString(),
    },
  });

  const selectedServiceId = form.watch('serviceId');
  const selectedMonth = form.watch('month');
  const selectedYear = form.watch('year');
  
  const selectedService = useMemo(() => {
    return allServices.find(s => s.id === selectedServiceId);
  }, [selectedServiceId, allServices]);

  useEffect(() => {
    if (!selectedServiceId || !selectedMonth || !selectedYear || !allServices.length || !allEmployees.length) {
      form.setValue('prompt', "Seleccione un servicio, mes y año para generar el prompt detallado.");
      return;
    }

    const service = allServices.find(s => s.id === selectedServiceId);
    if (!service) {
      form.setValue('prompt', "Servicio seleccionado no encontrado. Por favor, elija un servicio válido.");
      return;
    }

    const monthNum = parseInt(selectedMonth, 10);
    const yearNum = parseInt(selectedYear, 10);
    const targetDate = new Date(yearNum, monthNum - 1, 1);
    const monthName = format(targetDate, 'MMMM', { locale: es });
    const firstDayOfMonth = startOfMonth(targetDate);
    // const firstDayOfWeek = getDay(firstDayOfMonth); // 0 (Sun) - 6 (Sat), adapt if needed (es locale makes Monday 1)
    const daysInMonthVal = getDaysInMonth(targetDate);

    let dynamicPrompt = `Generar un horario de turnos mensual para ${monthName} de ${yearNum} para el servicio: ${service.name}.\n`;
    dynamicPrompt += `El mes de ${monthName} ${yearNum} tiene ${daysInMonthVal} días. El primer día del mes es ${format(firstDayOfMonth, 'EEEE', { locale: es })}.\n\n`;

    dynamicPrompt += "Reglas del Servicio:\n";
    dynamicPrompt += `- Nombre del Servicio: ${service.name}\n`;
    dynamicPrompt += `- Descripción: ${service.description}\n`;
    dynamicPrompt += `- Turno Noche Habilitado: ${service.enableNightShift ? 'Sí' : 'No'}\n`;
    dynamicPrompt += "Dotación Objetivo (Personal Requerido por turno):\n";
    dynamicPrompt += `  Lunes a Viernes:\n`;
    dynamicPrompt += `    Mañana: ${service.staffingNeeds.morningWeekday}, Tarde: ${service.staffingNeeds.afternoonWeekday}${service.enableNightShift ? `, Noche: ${service.staffingNeeds.nightWeekday}` : ''}\n`;
    dynamicPrompt += `  Sábados, Domingos y Feriados:\n`;
    dynamicPrompt += `    Mañana: ${service.staffingNeeds.morningWeekendHoliday}, Tarde: ${service.staffingNeeds.afternoonWeekendHoliday}${service.enableNightShift ? `, Noche: ${service.staffingNeeds.nightWeekendHoliday}` : ''}\n`;
    if (service.consecutivenessRules) {
      dynamicPrompt += "Reglas de Consecutividad:\n";
      dynamicPrompt += `  - Máx. Días de Trabajo Consecutivos: ${service.consecutivenessRules.maxConsecutiveWorkDays}\n`;
      dynamicPrompt += `  - Días de Trabajo Consecutivos Preferidos: ${service.consecutivenessRules.preferredConsecutiveWorkDays}\n`;
      dynamicPrompt += `  - Máx. Días de Descanso Consecutivos: ${service.consecutivenessRules.maxConsecutiveDaysOff}\n`;
      dynamicPrompt += `  - Días de Descanso Consecutivos Preferidos: ${service.consecutivenessRules.preferredConsecutiveDaysOff}\n`;
    }
    if (service.additionalNotes) {
      dynamicPrompt += `Notas Adicionales del Servicio: ${service.additionalNotes}\n`;
    }
    dynamicPrompt += "\n";

    const relevantEmployees = allEmployees.filter(emp => emp.serviceIds.includes(selectedServiceId));
    dynamicPrompt += `Personal Disponible para ${service.name} (${relevantEmployees.length}):\n`;
    if (relevantEmployees.length === 0) {
      dynamicPrompt += "- No hay empleados asignados directamente a este servicio.\n";
    }
    relevantEmployees.forEach(emp => {
      dynamicPrompt += `- ${emp.name} (Roles: ${emp.roles.join(', ')})\n`;
      if (emp.preferences) {
        if (emp.preferences.eligibleForDayOffAfterDuty) dynamicPrompt += `    - Elegible para D/D (Franco post-guardia).\n`;
        if (emp.preferences.prefersWeekendWork) dynamicPrompt += `    - Prefiere trabajar fines de semana.\n`;
        if (emp.preferences.fixedWeeklyShiftTiming && emp.preferences.fixedWeeklyShiftTiming !== 'none_selected') {
            const timingLabel = emp.preferences.fixedWeeklyShiftTiming === 'rest_day' ? 'D (Descanso)' : emp.preferences.fixedWeeklyShiftTiming;
            dynamicPrompt += `    - Turno Fijo Semanal: ${timingLabel} los días: ${emp.preferences.fixedWeeklyShiftDays?.join(', ') || 'No especificado'}\n`;
        }
      }
      if (emp.fixedAssignments && emp.fixedAssignments.length > 0) {
        const monthStartDate = new Date(yearNum, monthNum - 1, 1);
        const monthEndDate = new Date(yearNum, monthNum - 1, daysInMonthVal);
        const assignmentsInMonth = emp.fixedAssignments.filter(assign => {
            if (!assign.startDate) return false;
            const assignmentStartDate = parseISO(assign.startDate);
            const assignmentEndDate = assign.endDate ? parseISO(assign.endDate) : assignmentStartDate;
            
            const targetInterval = { start: monthStartDate, end: monthEndDate };
            const assignmentInterval = { start: assignmentStartDate, end: assignmentEndDate };

            return isValid(assignmentStartDate) && isValid(assignmentEndDate) && (
                isWithinInterval(assignmentStartDate, targetInterval) ||
                isWithinInterval(assignmentEndDate, targetInterval) ||
                (assignmentStartDate < monthStartDate && assignmentEndDate > monthEndDate)
            );
        });
        if (assignmentsInMonth.length > 0) {
          dynamicPrompt += `    - Asignaciones Fijas en ${monthName} ${yearNum}:\n`;
          assignmentsInMonth.forEach(assign => {
            dynamicPrompt += `      - Tipo: ${assign.type}, Inicio: ${assign.startDate}${assign.endDate ? `, Fin: ${assign.endDate}` : ''}${assign.description ? `, Desc: ${assign.description}` : ''}\n`;
          });
        }
      }
      if (emp.availability) dynamicPrompt += `    - Disponibilidad General: ${emp.availability}\n`;
      if (emp.constraints) dynamicPrompt += `    - Restricciones: ${emp.constraints}\n`;
    });
    dynamicPrompt += "\nInstrucciones Adicionales para la IA:\n";
    dynamicPrompt += "- Genere los turnos para todos los días del mes especificado.\n";
    dynamicPrompt += "- Asegúrese de que cada turno tenga fecha (YYYY-MM-DD), hora de inicio (HH:MM), hora de fin (HH:MM), nombre del empleado y nombre del servicio.\n";
    dynamicPrompt += "- Los horarios típicos son: Mañana (M) 07:00-15:00, Tarde (T) 15:00-23:00, Noche (N) 23:00-07:00 del día siguiente (si aplica y está habilitado). Considere estos horarios como guía si no se especifica otro.\n";
    dynamicPrompt += "- Respete estrictamente todas las reglas de dotación, consecutividad y las asignaciones fijas (D, LAO, LM) y preferencias de los empleados al generar el horario.\n";
    dynamicPrompt += "- Si un empleado tiene una asignación fija (ej. LAO) en ciertas fechas, no se le deben asignar turnos de trabajo en esas fechas.\n";
    dynamicPrompt += "- Distribuya la carga de trabajo y los tipos de turno (mañana, tarde, noche) de manera equitativa si es posible, respetando las preferencias.\n";
    dynamicPrompt += "- Devuelva la respuesta en el formato JSON especificado, incluyendo 'generatedShifts' y 'responseText'. Si no puede generar un horario válido, explique el problema en 'responseText'.\n";

    form.setValue('prompt', dynamicPrompt);

  }, [selectedServiceId, selectedMonth, selectedYear, allServices, allEmployees, form]);


  const handleGenerateSubmit = async (data: ShiftPromptFormData) => {
    setIsGenerating(true);
    setGeneratedResponseText(null);
    setAiGeneratedShifts(null);
    setEditableShifts(null);
    setError(null);
    setShowGrid(false);
    try {
      const input: SuggestShiftScheduleInput = { prompt: data.prompt };
      const result: SuggestShiftScheduleOutput = await suggestShiftSchedule(input);
      setGeneratedResponseText(result.responseText);
      if (result.generatedShifts && result.generatedShifts.length > 0) {
        setAiGeneratedShifts(result.generatedShifts);
        setEditableShifts(result.generatedShifts); // Initialize editable shifts
        setShowGrid(true); // Mostrar la cuadrícula
      } else if (!result.responseText?.toLowerCase().includes("error") && (!result.generatedShifts || result.generatedShifts.length === 0)) {
        setError("La IA generó una respuesta pero no se encontraron turnos estructurados. Revise el texto de respuesta.");
      } else if (result.responseText?.toLowerCase().includes("error")) {
         setError(`Respuesta de la IA: ${result.responseText}`);
      }
    } catch (e) {
      console.error("Error generando el horario:", e);
      setError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante la generación del horario.");
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
      // Opcional: limpiar después de guardar
      // setAiGeneratedShifts(null);
      // setEditableShifts(null);
      // setShowGrid(false);
      // setGeneratedResponseText("Turnos guardados exitosamente. Puede generar un nuevo horario.");
    } catch (e) {
       console.error("Error guardando los turnos:", e);
       setError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante el guardado de los turnos.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToConfig = () => {
    setShowGrid(false);
    // Opcionalmente, limpiar aiGeneratedShifts y editableShifts si se desea un reinicio completo
    // setAiGeneratedShifts(null);
    // setEditableShifts(null);
  };

  return (
    <Card className="w-full">
      {!showGrid ? (
        <>
          <CardHeader>
            <CardTitle className="font-headline flex items-center">
              <Sparkles className="mr-2 h-6 w-6 text-primary" />
              Generador de Turnos con IA
            </CardTitle>
            <CardDescription>
              Seleccione el servicio, mes y año. El prompt se llenará con las reglas y preferencias relevantes.
              Puede ajustarlo antes de generar el horario.
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
                <FormField
                  control={form.control}
                  name="prompt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prompt de Programación Detallado</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="El prompt se generará aquí basado en sus selecciones..."
                          rows={20}
                          className="min-h-[300px] font-mono text-xs bg-muted/30"
                          {...field}
                          disabled={isGenerating}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="flex flex-col items-stretch gap-4">
                <Button type="submit" disabled={isGenerating || isSaving || !selectedServiceId} className="w-full">
                  {isGenerating ? (
                    <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando Horario... </>
                  ) : (
                    <> <CalendarDays className="mr-2 h-4 w-4" /> Generar Horario para {selectedService?.name || ''} </>
                  )}
                </Button>
                 {generatedResponseText && !showGrid && ( // Mostrar respuesta de IA si no se muestra la cuadrícula
                    <Card className="mt-4 w-full">
                        <CardHeader><CardTitle>Respuesta de la IA</CardTitle></CardHeader>
                        <CardContent>
                        <Textarea value={generatedResponseText} readOnly rows={8} className="min-h-[100px] font-mono text-xs bg-muted/30"/>
                        </CardContent>
                    </Card>
                )}
              </CardFooter>
            </form>
          </Form>
        </>
      ) : (
        // Mostrar la cuadrícula interactiva
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
       {!showGrid && generatedResponseText && aiGeneratedShifts && aiGeneratedShifts.length > 0 && (
         <CardFooter className="flex flex-col items-stretch gap-4 pt-0">
            <Button onClick={() => setShowGrid(true)} variant="outline" className="w-full">
                <Eye className="mr-2 h-4 w-4" /> Ver y Editar Horario Interactivo ({aiGeneratedShifts.length} turnos)
            </Button>
         </CardFooter>
      )}
    </Card>
  );
}

