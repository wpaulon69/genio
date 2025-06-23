"use client";

import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Eye, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { AIShift, Employee, Service, Holiday, MonthlySchedule, ScoreBreakdown, ScheduleViolation } from '@/lib/types';
import { format } from 'date-fns';
import GenerationInfo from './GenerationInfo';
import { es } from 'date-fns/locale';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import InteractiveScheduleGrid from './InteractiveScheduleGrid';
import ScheduleEvaluationDisplay from './schedule-evaluation-display';
import { generateAlgorithmicSchedule } from '@/lib/scheduler';
import { Input } from '@/components/ui/input'; // Importar Input

const shiftGenerationConfigSchema = z.object({
  serviceId: z.string().min(1, "Debe seleccionar un servicio."),
  month: z.string().min(1, "Debe seleccionar un mes."),
  year: z.string().min(1, "Debe seleccionar un año."),
});

type ShiftGenerationConfigFormData = z.infer<typeof shiftGenerationConfigSchema>;

interface ShiftGeneratorFormProps {
  allEmployees: Employee[];
  allServices: Service[];
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());
const months = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString(),
  label: format(new Date(currentYear, i), 'MMMM', { locale: es }),
}));

export default function ShiftGeneratorForm({ allEmployees, allServices }: ShiftGeneratorFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [generationInfo, setGenerationInfo] = useState<{ service: Service; employees: Employee[] } | null>(null);
  const [scheduleName, setScheduleName] = useState<string>(""); // Estado para el nombre del horario

  const [generatedShifts, setGeneratedShifts] = useState<AIShift[] | null>(null);
  const [evaluation, setEvaluation] = useState<{
    score: number;
    violations: ScheduleViolation[];
    scoreBreakdown: ScoreBreakdown;
    responseText: string;
  } | null>(null);

  const { data: holidays = [], isLoading: isLoadingHolidays } = useQuery<Holiday[]>({
    queryKey: ['holidays'],
    queryFn: async () => fetch('/api/holidays').then(res => res.json()),
  });

  const saveScheduleMutation = useMutation({
    mutationFn: async (scheduleData: Partial<MonthlySchedule>) => {
      const response = await fetch('/api/monthlySchedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleData),
      });
      if (!response.ok) {
        throw new Error('Failed to save schedule');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthlySchedules'] });
      toast({ title: "Horario Guardado", description: "El horario ha sido guardado exitosamente." });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo guardar el horario: ${err.message}` });
    },
  });

  const form = useForm<ShiftGenerationConfigFormData>({
    resolver: zodResolver(shiftGenerationConfigSchema),
    defaultValues: {
      serviceId: allServices.length > 0 ? allServices[0].id_servicio.toString() : '',
      month: (new Date().getMonth() + 1).toString(),
      year: new Date().getFullYear().toString(),
    },
  });

  const watchedServiceId = form.watch('serviceId');
  const selectedService = useMemo(() => {
    return allServices.find(s => s.id_servicio.toString() === watchedServiceId);
  }, [watchedServiceId, allServices]);

  const handleGenerateSubmit = async (data: ShiftGenerationConfigFormData) => {
    if (!selectedService) {
      toast({ variant: "destructive", title: "Error", description: "Servicio no encontrado." });
      return;
    }

    console.log("Selected Service:", JSON.stringify(selectedService, null, 2));

    const employeesForService = allEmployees.filter(emp => emp.id_servicio.toString() === selectedService.id_servicio.toString());
    
    setGenerationInfo({ service: selectedService, employees: employeesForService });

    setIsGenerating(true);
    setError(null);
    setGeneratedShifts(null);
    setEvaluation(null);
    setShowGrid(false);

    try {
      const result = await generateAlgorithmicSchedule(
        selectedService,
        data.month,
        data.year,
        allEmployees,
        holidays,
        null // previousMonthSchedule.shifts
      );
      console.log("[ShiftGeneratorForm] Generation result:", result); // Log del resultado
      setGeneratedShifts(result.generatedShifts);
      setEvaluation({
        score: result.score,
        violations: result.violations,
        scoreBreakdown: result.scoreBreakdown,
        responseText: result.responseText,
      });
      toast({ title: "Generación Completa", description: `Horario generado con una puntuación de ${result.score.toFixed(0)}/100.` });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error desconocido en la generación.";
      console.error("[ShiftGeneratorForm] Error during generation:", e); // Log del error
      setError(message);
      toast({ variant: "destructive", title: "Error de Generación", description: message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = (shifts: AIShift[], status: 'published' | 'draft') => {
    if (!selectedService) return;

    const scheduleNameFromPrompt = prompt("Por favor, ingrese un nombre para este horario:", `Horario ${selectedService.nombre_servicio} - ${months.find(m => m.value === form.getValues('month'))?.label} ${form.getValues('year')}`);

    if (!scheduleNameFromPrompt) {
      toast({
        variant: "default",
        title: "Guardado cancelado",
        description: "No se ingresó un nombre para el horario.",
      });
      return;
    }
    setScheduleName(scheduleNameFromPrompt); // Actualizar el estado, aunque se usa directamente el del prompt

    const now = Date.now();
    const scheduleData: Partial<MonthlySchedule> = {
      scheduleKey: `${selectedService.id_servicio}-${form.getValues('year')}-${form.getValues('month')}-${status}-${Date.now()}`, // Asegurar unicidad
      year: form.getValues('year'),
      month: form.getValues('month'),
      serviceId: selectedService.id_servicio.toString(),
      serviceName: selectedService.nombre_servicio,
      horario_nombre: scheduleNameFromPrompt, // Añadir nombre del horario
      status,
      shifts,
      version: 1, // O una lógica de versionado más compleja
      createdAt: now,
      updatedAt: now,
      score: evaluation?.score ?? null,
      violations: evaluation?.violations ?? [],
      scoreBreakdown: evaluation?.scoreBreakdown ?? null,
      responseText: evaluation?.responseText ?? null,
    };
    saveScheduleMutation.mutate(scheduleData);
  };

  const handleShiftsChange = (newShifts: AIShift[]) => {
    console.log("handleShiftsChange called, newShifts:", newShifts);
    setGeneratedShifts(newShifts);
  };

  console.log("[ShiftGeneratorForm] Rendering. showGrid:", showGrid, "generatedShifts:", !!generatedShifts, "selectedService:", !!selectedService);

  if (showGrid && generatedShifts && selectedService) {
    console.log("[ShiftGeneratorForm] Rendering InteractiveScheduleGrid");
    return (
      <InteractiveScheduleGrid
        initialShifts={generatedShifts}
        allEmployees={allEmployees}
        targetService={selectedService}
        month={form.getValues('month')}
        year={form.getValues('year')}
        holidays={holidays}
        onBackToConfig={() => setShowGrid(false)}
        onSave={handleSave}
        onShiftsChange={handleShiftsChange}
      />
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Configuración de Generación de Horario</CardTitle>
        <CardDescription>
          Seleccione el servicio, mes y año para generar un nuevo horario.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleGenerateSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField control={form.control} name="serviceId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Servicio</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar Servicio" /></SelectTrigger></FormControl>
                    <SelectContent>{allServices.map(s => (<SelectItem key={s.id_servicio} value={s.id_servicio.toString()}>{s.nombre_servicio}</SelectItem>))}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="month" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mes</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger></FormControl>
                    <SelectContent>{months.map(m => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="year" render={({ field }) => (
                <FormItem>
                  <FormLabel>Año</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Año" /></SelectTrigger></FormControl>
                    <SelectContent>{years.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <Button type="submit" disabled={isGenerating || isLoadingHolidays}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generar Nuevo Horario Algorítmico
            </Button>
            {error && <p className="text-sm font-medium text-destructive mt-2">{error}</p>}
          </CardContent>
        </form>
      </Form>
      {generationInfo && !isGenerating && (
        <CardContent>
          <GenerationInfo service={generationInfo.service} employees={generationInfo.employees} />
        </CardContent>
      )}
      {evaluation && (
        <CardContent>
          <ScheduleEvaluationDisplay
            score={evaluation.score}
            violations={evaluation.violations}
            scoreBreakdown={evaluation.scoreBreakdown}
            context="generator"
          />
          <div className="mt-4 flex justify-end">
            <Button onClick={() => {
              console.log("[ShiftGeneratorForm] Ver/Editar Grilla button clicked. Current state: showGrid:", showGrid, "generatedShifts:", !!generatedShifts, "selectedService:", !!selectedService);
              setShowGrid(true);
            }}>
              <Eye className="mr-2 h-4 w-4" />
              Ver/Editar Grilla
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
