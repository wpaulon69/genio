
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
import { Sparkles, Loader2, AlertTriangle, Save, CalendarDays, Eye, Bot } from 'lucide-react';
// import { suggestShiftSchedule, type SuggestShiftScheduleInput, type SuggestShiftScheduleOutput, type AIShift } from '@/ai/flows/suggest-shift-schedule';
import { generateAlgorithmicSchedule } from '@/lib/scheduler/algorithmic-scheduler';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule'; // Reusing this type
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Employee, Service } from '@/lib/types';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import InteractiveScheduleGrid from './InteractiveScheduleGrid';

const shiftGenerationConfigSchema = z.object({
  // Prompt field is no longer primary, but schema might be kept for future AI toggle
  // prompt: z.string().min(50, "El prompt debe tener al menos 50 caracteres para proporcionar suficientes detalles para la generación del horario."),
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

export default function ShiftGeneratorForm({ onSaveShifts, allEmployees, allServices }: ShiftGeneratorFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedResponseText, setGeneratedResponseText] = useState<string | null>(null);
  // const [aiGeneratedShifts, setAiGeneratedShifts] = useState<AIShift[] | null>(null); // Renaming to reflect general generated shifts
  const [algorithmGeneratedShifts, setAlgorithmGeneratedShifts] = useState<AIShift[] | null>(null);
  const [editableShifts, setEditableShifts] = useState<AIShift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);

  const form = useForm<ShiftGenerationConfigFormData>({
    resolver: zodResolver(shiftGenerationConfigSchema),
    defaultValues: {
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

  // useEffect for dynamic prompt generation is removed as AI is no longer the primary generation method.
  // The prompt textarea will also be removed or hidden.

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
      // Call the algorithmic scheduler
      const result = await generateAlgorithmicSchedule(
        selectedService,
        data.month,
        data.year,
        allEmployees // Pass all employees for the algorithm to filter by service and access full details
      );
      setGeneratedResponseText(result.responseText);
      if (result.generatedShifts && result.generatedShifts.length > 0) {
        setAlgorithmGeneratedShifts(result.generatedShifts);
        setEditableShifts(result.generatedShifts); 
        setShowGrid(true); 
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
              <Bot className="mr-2 h-6 w-6 text-primary" /> {/* Changed icon */}
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
                {/* Prompt Textarea is removed/hidden as it's not used for algorithmic generation */}
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
                    <Card className="mt-4 w-full">
                        <CardHeader><CardTitle>Respuesta del Algoritmo</CardTitle></CardHeader>
                        <CardContent>
                        <Textarea value={generatedResponseText} readOnly rows={5} className="min-h-[80px] font-mono text-xs bg-muted/30"/>
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
