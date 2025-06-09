
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
import { Loader2, Save, CalendarDays, Eye, Bot, Info, AlertTriangle, Edit, FilePlus2, Archive, UploadCloud } from 'lucide-react';
import { generateAlgorithmicSchedule } from '@/lib/scheduler/algorithmic-scheduler';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Employee, Service, Holiday, MonthlySchedule, ScoreBreakdown } from '@/lib/types';
import { format, isValid, parseISO, getYear as getYearFromDate, getMonth as getMonthFromDate, startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import InteractiveScheduleGrid from './InteractiveScheduleGrid';
import ScheduleEvaluationDisplay from './schedule-evaluation-display'; 
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getHolidays } from '@/lib/firebase/holidays';
import { getActiveMonthlySchedule, saveNewActiveSchedule, updateExistingActiveSchedule, generateScheduleKey } from '@/lib/firebase/monthlySchedules';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  
  const [generatedResponseText, setGeneratedResponseText] = useState<string | null>(null);
  const [algorithmGeneratedShifts, setAlgorithmGeneratedShifts] = useState<AIShift[] | null>(null);
  const [editableShifts, setEditableShifts] = useState<AIShift[] | null>(null);
  const [generatedScore, setGeneratedScore] = useState<number | null>(null);
  const [generatedViolations, setGeneratedViolations] = useState<MonthlySchedule['violations'] | null>(null);
  const [generatedScoreBreakdown, setGeneratedScoreBreakdown] = useState<MonthlySchedule['scoreBreakdown'] | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [displayInfoText, setDisplayInfoText] = useState<string>("");

  const [currentLoadedSchedule, setCurrentLoadedSchedule] = useState<MonthlySchedule | null>(null);
  const [previousMonthSchedule, setPreviousMonthSchedule] = useState<MonthlySchedule | null>(null);
  const [showInitialChoiceDialog, setShowInitialChoiceDialog] = useState(false);
  const [userChoiceForExisting, setUserChoiceForExisting] = useState<'modify' | 'generate_new' | null>(null);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveActionType, setSaveActionType] = useState<'update_or_new_version' | 'confirm_new_with_archive' | 'confirm_save_brand_new' | null>(null);
  
  const [configLoaded, setConfigLoaded] = useState(false);
  const [loadedConfigValues, setLoadedConfigValues] = useState<ShiftGenerationConfigFormData | null>(null);


  const { data: holidays = [], isLoading: isLoadingHolidays, error: errorHolidays } = useQuery<Holiday[]>({
    queryKey: ['holidays'],
    queryFn: getHolidays,
  });

  const form = useForm<ShiftGenerationConfigFormData>({
    resolver: zodResolver(shiftGenerationConfigSchema),
    defaultValues: {
      serviceId: allServices.length > 0 ? allServices[0].id : '',
      month: (new Date().getMonth() + 1).toString(),
      year: new Date().getFullYear().toString(),
    },
  });

  const watchedServiceId = form.watch('serviceId');
  const watchedMonth = form.watch('month');
  const watchedYear = form.watch('year');
  
  const watchedSelectedService = useMemo(() => {
    return allServices.find(s => s.id === watchedServiceId);
  }, [watchedServiceId, allServices]);

  useEffect(() => {
    if (watchedSelectedService && watchedMonth && watchedYear && allEmployees && !isLoadingHolidays) {
      const monthIdx = parseInt(watchedMonth, 10) - 1;
      const yearInt = parseInt(watchedYear, 10);
      
      const monthDate = new Date(yearInt, monthIdx, 1);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      let info = `Resumen para generar horario para el servicio: ${watchedSelectedService.name}\n`;
      info += `Mes: ${months.find(m => m.value === watchedMonth)?.label || watchedMonth}, Año: ${watchedYear}\n\n`;
      
      info += "Reglas del Servicio:\n";
      info += `- Dotación Días de Semana: Mañana=${watchedSelectedService.staffingNeeds.morningWeekday}, Tarde=${watchedSelectedService.staffingNeeds.afternoonWeekday}${watchedSelectedService.enableNightShift ? `, Noche=${watchedSelectedService.staffingNeeds.nightWeekday}` : ''}\n`;
      info += `- Dotación Fin de Semana/Feriados: Mañana=${watchedSelectedService.staffingNeeds.morningWeekendHoliday}, Tarde=${watchedSelectedService.staffingNeeds.afternoonWeekendHoliday}${watchedSelectedService.enableNightShift ? `, Noche=${watchedSelectedService.staffingNeeds.nightWeekendHoliday}` : ''}\n`;
      info += `- Turno Noche (N) Habilitado: ${watchedSelectedService.enableNightShift ? 'Sí' : 'No'}\n`;
      if (watchedSelectedService.consecutivenessRules) {
        info += `- Consecutividad Trabajo: Máx=${watchedSelectedService.consecutivenessRules.maxConsecutiveWorkDays}, Pref=${watchedSelectedService.consecutivenessRules.preferredConsecutiveWorkDays}\n`;
        info += `- Consecutividad Descanso: Máx=${watchedSelectedService.consecutivenessRules.maxConsecutiveDaysOff}, Pref=${watchedSelectedService.consecutivenessRules.preferredConsecutiveDaysOff}\n`;
        if (watchedSelectedService.consecutivenessRules.minConsecutiveDaysOffRequiredBeforeWork) {
          info += `- Mín. Descansos Antes de Trabajar: ${watchedSelectedService.consecutivenessRules.minConsecutiveDaysOffRequiredBeforeWork}\n`;
        }
      }
      if (watchedSelectedService.additionalNotes) {
        info += `- Notas Adicionales del Servicio: ${watchedSelectedService.additionalNotes}\n`;
      }
      info += "\n";

      const holidaysInMonth = holidays.filter(h => {
        const holidayDate = parseISO(h.date);
        return isValid(holidayDate) && getYearFromDate(holidayDate) === yearInt && getMonthFromDate(holidayDate) === monthIdx;
      });

      if (holidaysInMonth.length > 0) {
        info += `Feriados en ${months.find(m => m.value === watchedMonth)?.label || watchedMonth} ${watchedYear}:\n`;
        holidaysInMonth.forEach(h => {
            info += `  - ${format(parseISO(h.date), 'dd/MM/yyyy')}: ${h.name}\n`;
        });
        info += "\n";
      } else {
        info += `No hay feriados registrados para ${months.find(m => m.value === watchedMonth)?.label || watchedMonth} ${watchedYear}.\n\n`;
      }

      const employeesInService = allEmployees.filter(emp => emp.serviceIds.includes(watchedSelectedService.id));
      info += `Empleados Asignados a ${watchedSelectedService.name} (${employeesInService.length}):\n`;
      if (employeesInService.length === 0) {
        info += "- Ninguno\n";
      } else {
        employeesInService.forEach(emp => {
          info += `\n- ${emp.name} (Roles: ${emp.roles.join(', ') || 'N/A'})\n`;
          if (emp.preferences) {
            const workPatternLabel = 
                emp.preferences.workPattern === 'mondayToFridayMorning' ? 'L-V Mañana Fijo' :
                emp.preferences.workPattern === 'mondayToFridayAfternoon' ? 'L-V Tarde Fijo' :
                'Rotación Estándar';
            info += `  - Patrón General: ${workPatternLabel}\n`;
            info += `  - Prefiere FDS: ${emp.preferences.prefersWeekendWork ? 'Sí' : 'No'}\n`;
            info += `  - Elegible D/D: ${emp.preferences.eligibleForDayOffAfterDuty ? 'Sí' : 'No'}\n`;
            if ((!emp.preferences.workPattern || emp.preferences.workPattern === 'standardRotation') && emp.preferences.fixedWeeklyShiftDays && emp.preferences.fixedWeeklyShiftDays.length > 0) {
              info += `  - Turno Fijo Semanal: Días=[${emp.preferences.fixedWeeklyShiftDays.join(', ')}], Horario=${emp.preferences.fixedWeeklyShiftTiming || 'No especificado'}\n`;
            }
          }
          const relevantAssignments = (emp.fixedAssignments || []).filter(assign => {
            if (!assign.startDate) return false;
            const assignmentStartDate = parseISO(assign.startDate);
            const assignmentEndDate = assign.endDate ? parseISO(assign.endDate) : assignmentStartDate;
            if (!isValid(assignmentStartDate) || (assign.endDate && !isValid(assignmentEndDate))) return false;
            
            const currentAssignmentInterval = { 
                start: startOfDay(assignmentStartDate), 
                end: endOfDay(assignmentEndDate) 
            };
            
            return isWithinInterval(monthStart, currentAssignmentInterval) || 
                   isWithinInterval(monthEnd, currentAssignmentInterval) ||
                   (assignmentStartDate < monthStart && assignmentEndDate > monthEnd);
          });

          if (relevantAssignments.length > 0) {
            info += `  - Asignaciones Fijas en ${months.find(m => m.value === watchedMonth)?.label || watchedMonth}:\n`;
            relevantAssignments.forEach(assign => {
              const startDateFormatted = format(parseISO(assign.startDate), 'dd/MM/yyyy');
              const endDateFormatted = assign.endDate && assign.endDate !== assign.startDate ? format(parseISO(assign.endDate), 'dd/MM/yyyy') : startDateFormatted;
              info += `    - ${assign.type}: ${startDateFormatted}${assign.endDate && assign.endDate !== assign.startDate ? ' a ' + endDateFormatted : ''} ${assign.description ? '('+assign.description+')' : ''}\n`;
            });
          }
        });
      }
      setDisplayInfoText(info);
    } else if (isLoadingHolidays) {
      setDisplayInfoText("Cargando lista de feriados...");
    } else {
      setDisplayInfoText("Seleccione un servicio, mes y año para ver el resumen y luego haga clic en 'Cargar Configuración'. Asegúrese de que los feriados estén cargados.");
    }
  }, [watchedServiceId, watchedMonth, watchedYear, allServices, allEmployees, watchedSelectedService, holidays, isLoadingHolidays]);

  const handleLoadConfiguration = async () => {
    const { serviceId, month, year } = form.getValues();
    if (!serviceId || !month || !year) {
      setError("Por favor, seleccione servicio, mes y año.");
      return;
    }

    setIsLoadingConfig(true);
    setError(null);
    setAlgorithmGeneratedShifts(null);
    setEditableShifts(null);
    setGeneratedResponseText(null);
    setGeneratedScore(null);
    setGeneratedViolations(null);
    setGeneratedScoreBreakdown(null);
    setShowGrid(false);
    setUserChoiceForExisting(null);
    setCurrentLoadedSchedule(null);
    setPreviousMonthSchedule(null);
    setConfigLoaded(false);

    try {
      const existingSchedule = await getActiveMonthlySchedule(year, month, serviceId);
      setCurrentLoadedSchedule(existingSchedule);
      setGeneratedScore(existingSchedule?.score ?? null); 
      setGeneratedViolations(existingSchedule?.violations ?? null);
      setGeneratedScoreBreakdown(existingSchedule?.scoreBreakdown ?? null);


      const currentMonthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const prevMonthDate = subMonths(currentMonthDate, 1);
      const prevMonthYearStr = format(prevMonthDate, 'yyyy');
      const prevMonthMonthStr = format(prevMonthDate, 'M');
      const prevSchedule = await getActiveMonthlySchedule(prevMonthYearStr, prevMonthMonthStr, serviceId);
      setPreviousMonthSchedule(prevSchedule);
      
      setConfigLoaded(true); 
      setLoadedConfigValues({serviceId, month, year}); 

      if (existingSchedule) {
        setShowInitialChoiceDialog(true);
      } else {
        setShowInitialChoiceDialog(false); 
        setUserChoiceForExisting(null);
      }
    } catch (e) {
      console.error("Error cargando configuración de horarios:", e);
      setError("Error al cargar configuración de horarios.");
      setCurrentLoadedSchedule(null);
      setPreviousMonthSchedule(null);
      setConfigLoaded(false);
      setLoadedConfigValues(null);
    } finally {
      setIsLoadingConfig(false);
    }
  };


  const handleGenerateSubmit = async (data: ShiftGenerationConfigFormData) => {
    if (!watchedSelectedService) {
        setError("Por favor, seleccione un servicio válido y cargue la configuración.");
        return;
    }
    if (isLoadingHolidays) {
        setError("Esperando a que cargue la lista de feriados.");
        return;
    }
    if (errorHolidays) {
        setError("Error al cargar feriados. No se puede generar el horario.");
        return;
    }
    if (loadedConfigValues && (data.serviceId !== loadedConfigValues.serviceId || data.month !== loadedConfigValues.month || data.year !== loadedConfigValues.year)) {
        setError("La selección ha cambiado. Por favor, haga clic en 'Cargar Configuración' antes de generar.");
        toast({ variant: "destructive", title: "Selección Cambiada", description: "Recargue la configuración."});
        return;
    }
    if (!configLoaded && !currentLoadedSchedule) { 
        setError("Por favor, cargue primero la configuración haciendo clic en 'Cargar Configuración'.");
        toast({ variant: "destructive", title: "Configuración no Cargada", description: "Cargue la configuración."});
        return;
    }

    setIsGenerating(true);
    setGeneratedResponseText(null);
    setAlgorithmGeneratedShifts(null);
    setEditableShifts(null);
    setGeneratedScore(null);
    setGeneratedViolations(null);
    setGeneratedScoreBreakdown(null);
    setError(null);
    setShowGrid(false); 
    try {
      const result = await generateAlgorithmicSchedule(
        watchedSelectedService,
        data.month,
        data.year,
        allEmployees,
        holidays,
        previousMonthSchedule?.shifts || null
      );
      setGeneratedResponseText(result.responseText);
      setGeneratedScore(result.score);
      setGeneratedViolations(result.violations);
      setGeneratedScoreBreakdown(result.scoreBreakdown);

      if (result.generatedShifts && result.generatedShifts.length > 0) {
        setAlgorithmGeneratedShifts(result.generatedShifts);
        setEditableShifts(result.generatedShifts); 
      } else if (!result.responseText?.toLowerCase().includes("error") && (!result.generatedShifts || result.generatedShifts.length === 0)) {
        setError("El algoritmo generó una respuesta pero no se encontraron turnos estructurados. Revise el texto de respuesta y el informe de violaciones.");
      } else if (result.responseText?.toLowerCase().includes("error") || (result.generatedShifts && result.generatedShifts.length === 0)) {
         setError(`Respuesta del algoritmo: ${result.responseText}`);
      }
    } catch (e) {
      console.error("Error generando el horario con el algoritmo:", e);
      setError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante la generación algorítmica del horario.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmSave = async (action: 'update' | 'new_version') => {
    setShowSaveDialog(false);
    if (!editableShifts || !watchedSelectedService || !watchedYear || !watchedMonth) {
        setError("Faltan datos para guardar el horario.");
        toast({ variant: "destructive", title: "Error", description: "Faltan datos para guardar el horario." });
        return;
    }
    setIsSaving(true);
    setError(null);

    try {
        let savedOrUpdatedSchedule: MonthlySchedule | null = null;
        const scoreToSave = generatedScore ?? currentLoadedSchedule?.score ?? 0;
        const violationsToSave = generatedViolations ?? currentLoadedSchedule?.violations ?? [];
        const responseTextToSave = generatedResponseText ?? currentLoadedSchedule?.responseText ?? "Horario guardado.";
        
        const scoreBreakdownToSave = generatedScoreBreakdown ?? currentLoadedSchedule?.scoreBreakdown;
        const plainScoreBreakdownToSave = scoreBreakdownToSave
            ? { serviceRules: scoreBreakdownToSave.serviceRules, employeeWellbeing: scoreBreakdownToSave.employeeWellbeing }
            : undefined;


        if (action === 'update' && currentLoadedSchedule?.id && userChoiceForExisting === 'modify') {
            await updateExistingActiveSchedule(currentLoadedSchedule.id, editableShifts, responseTextToSave, scoreToSave, violationsToSave, plainScoreBreakdownToSave);
            toast({ title: "Horario Actualizado", description: "El horario activo ha sido actualizado." });
            const updatedSchedule = await getActiveMonthlySchedule(watchedYear, watchedMonth, watchedServiceId);
            savedOrUpdatedSchedule = updatedSchedule;
        } else { 
            const scheduleData: Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'> = {
                scheduleKey: generateScheduleKey(watchedYear, watchedMonth, watchedServiceId),
                year: watchedYear,
                month: watchedMonth,
                serviceId: watchedServiceId,
                serviceName: watchedSelectedService.name,
                shifts: editableShifts,
                responseText: responseTextToSave,
                score: scoreToSave,
                violations: violationsToSave,
                scoreBreakdown: plainScoreBreakdownToSave,
            };
            const newActive = await saveNewActiveSchedule(scheduleData, currentLoadedSchedule?.id);
            savedOrUpdatedSchedule = newActive;
            toast({ title: "Horario Guardado", description: `El horario para ${watchedSelectedService.name} - ${months.find(m=>m.value===watchedMonth)?.label}/${watchedYear} se guardó como activo.` });
        }
        
        setCurrentLoadedSchedule(savedOrUpdatedSchedule);
        if(savedOrUpdatedSchedule?.shifts) setEditableShifts([...savedOrUpdatedSchedule.shifts]);
        setGeneratedScore(savedOrUpdatedSchedule?.score ?? null);
        setGeneratedViolations(savedOrUpdatedSchedule?.violations ?? null);
        setGeneratedResponseText(savedOrUpdatedSchedule?.responseText ?? null);
        setGeneratedScoreBreakdown(savedOrUpdatedSchedule?.scoreBreakdown ?? null);
        setLoadedConfigValues({serviceId: watchedServiceId, month: watchedMonth, year: watchedYear}); 

        queryClient.invalidateQueries({ queryKey: ['monthlySchedule', watchedYear, watchedMonth, watchedServiceId] });
        setShowGrid(true); 
    } catch (e) {
        console.error("Error guardando el horario:", e);
        const message = e instanceof Error ? e.message : "Ocurrió un error desconocido al guardar el horario.";
        setError(message);
        toast({ variant: "destructive", title: "Error al Guardar", description: message });
    } finally {
        setIsSaving(false);
    }
  };

  const handleSaveGeneratedShiftsClick = () => {
    if (!editableShifts || editableShifts.length === 0) {
      setError("No hay turnos para guardar.");
      toast({ variant: "destructive", title: "Error", description: "No hay turnos generados o editados para guardar." });
      return;
    }

    if (userChoiceForExisting === 'modify' && currentLoadedSchedule) {
        setSaveActionType('update_or_new_version');
    } else if (currentLoadedSchedule && (userChoiceForExisting === 'generate_new' || !userChoiceForExisting )) {
        setSaveActionType('confirm_new_with_archive');
    } else { 
        setSaveActionType('confirm_save_brand_new');
    }
    setShowSaveDialog(true);
  };

  const handleBackToConfig = () => {
    setShowGrid(false);
  };

  const handleInitialChoice = (choice: 'modify' | 'generate_new') => {
    setShowInitialChoiceDialog(false);
    setUserChoiceForExisting(choice);
    if (choice === 'modify' && currentLoadedSchedule) {
        setEditableShifts(currentLoadedSchedule.shifts ? [...currentLoadedSchedule.shifts] : []);
        setGeneratedResponseText(currentLoadedSchedule.responseText || "");
        setGeneratedScore(currentLoadedSchedule.score ?? null);
        setGeneratedViolations(currentLoadedSchedule.violations ?? null);
        setGeneratedScoreBreakdown(currentLoadedSchedule.scoreBreakdown ?? null);
        setShowGrid(true);
    } else { 
        setEditableShifts(null);
        setAlgorithmGeneratedShifts(null);
        setShowGrid(false);
    }
  };
  
  const isFormSelectionChanged = () => {
    if (!loadedConfigValues) return false; 
    const currentFormValues = form.getValues();
    return currentFormValues.serviceId !== loadedConfigValues.serviceId ||
           currentFormValues.month !== loadedConfigValues.month ||
           currentFormValues.year !== loadedConfigValues.year;
  };

  const isActionDisabled = isGenerating || isSaving || isLoadingHolidays || !!errorHolidays || isLoadingConfig;
  const canGenerate = configLoaded && (userChoiceForExisting === 'generate_new' || !currentLoadedSchedule) && !isFormSelectionChanged();

  const scoreForEvaluation = showGrid && editableShifts ? (generatedScore ?? currentLoadedSchedule?.score) : (algorithmGeneratedShifts ? generatedScore : currentLoadedSchedule?.score);
  const violationsForEvaluation = showGrid && editableShifts ? (generatedViolations ?? currentLoadedSchedule?.violations) : (algorithmGeneratedShifts ? generatedViolations : currentLoadedSchedule?.violations);
  const breakdownForEvaluation = showGrid && editableShifts ? (generatedScoreBreakdown ?? currentLoadedSchedule?.scoreBreakdown) : (algorithmGeneratedShifts ? generatedScoreBreakdown : currentLoadedSchedule?.scoreBreakdown);


  return (
    <Card className="w-full">
      {!showGrid ? (
        <>
          <CardHeader>
            <CardTitle className="font-headline flex items-center">
              <Bot className="mr-2 h-6 w-6 text-primary" />
              Generador de Horarios
            </CardTitle>
            <CardDescription>
              Seleccione servicio, mes y año, luego haga clic en "Cargar Configuración". Si existe un horario activo, podrá modificarlo o generar uno nuevo.
            </CardDescription>
          </CardHeader>
          
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleGenerateSubmit)}> 
                <CardContent className="space-y-6">
                  {errorHolidays && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Error al Cargar Feriados</AlertTitle>
                      <AlertDescription>
                        No se pudieron cargar los feriados: {errorHolidays.message}. La generación de horarios podría no ser precisa.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="serviceId" render={({ field }) => (
                        <FormItem> <FormLabel>Servicio</FormLabel>
                          <Select onValueChange={(value) => { field.onChange(value); setConfigLoaded(false); }} value={field.value || ''} disabled={isActionDisabled || showInitialChoiceDialog}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un servicio" /></SelectTrigger></FormControl>
                            <SelectContent>{allServices.map(service => (<SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>))}</SelectContent>
                          </Select><FormMessage />
                        </FormItem>)} />
                    <FormField control={form.control} name="month" render={({ field }) => (
                        <FormItem> <FormLabel>Mes</FormLabel>
                          <Select onValueChange={(value) => { field.onChange(value); setConfigLoaded(false); }} value={field.value} disabled={isActionDisabled || showInitialChoiceDialog}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un mes" /></SelectTrigger></FormControl>
                            <SelectContent>{months.map(m => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent>
                          </Select><FormMessage />
                        </FormItem>)} />
                    <FormField control={form.control} name="year" render={({ field }) => (
                        <FormItem> <FormLabel>Año</FormLabel>
                          <Select onValueChange={(value) => { field.onChange(value); setConfigLoaded(false); }} value={field.value} disabled={isActionDisabled || showInitialChoiceDialog}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un año" /></SelectTrigger></FormControl>
                            <SelectContent>{years.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent>
                          </Select><FormMessage />
                        </FormItem>)} />
                  </div>

                   <Button type="button" onClick={handleLoadConfiguration} disabled={isActionDisabled || showInitialChoiceDialog || isLoadingHolidays} className="w-full md:w-auto">
                    {isLoadingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                     Cargar Configuración
                  </Button>
                  
                  { (configLoaded && userChoiceForExisting !== 'modify' && !showInitialChoiceDialog) && (
                    <FormItem className="mt-4">
                        <FormLabel className="flex items-center"><Info className="mr-2 h-4 w-4 text-primary" /> Información para Generación</FormLabel>
                        <Textarea value={isLoadingHolidays ? "Cargando feriados..." : displayInfoText} readOnly rows={10} className="min-h-[150px] font-mono text-xs bg-muted/30 border-dashed" placeholder="Seleccione servicio, mes y año para ver el resumen..." />
                    </FormItem>
                  )}
                  {(!configLoaded && !showInitialChoiceDialog) && (
                     <Alert variant="default" className="mt-4">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Información Pendiente</AlertTitle>
                        <AlertDescription>{displayInfoText}</AlertDescription>
                    </Alert>
                  )}


                </CardContent>
                <CardFooter className="flex flex-col items-stretch gap-4">
                { (configLoaded && (userChoiceForExisting === 'generate_new' || (!currentLoadedSchedule && !showInitialChoiceDialog))) && (
                    <Button type="submit" disabled={isActionDisabled || !watchedServiceId || showInitialChoiceDialog || isFormSelectionChanged()} className="w-full">
                        {isGenerating ? ( <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando Horario... </>
                        ) : ( <> <CalendarDays className="mr-2 h-4 w-4" /> Generar Horario para {watchedSelectedService?.name || ''} </> )}
                    </Button>
                )}
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
        editableShifts && watchedMonth && watchedYear && (
          <InteractiveScheduleGrid
            initialShifts={editableShifts}
            allEmployees={allEmployees}
            targetService={watchedSelectedService} 
            month={watchedMonth} 
            year={watchedYear}   
            holidays={holidays} 
            onShiftsChange={(updatedShifts) => setEditableShifts(updatedShifts)}
            onBackToConfig={handleBackToConfig}
          />
        )
      )}
      
      {((showGrid && editableShifts) || (algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0) || (currentLoadedSchedule && userChoiceForExisting === null && !showInitialChoiceDialog && !isLoadingConfig && configLoaded)) && (
         <ScheduleEvaluationDisplay
            score={scoreForEvaluation}
            violations={violationsForEvaluation}
            scoreBreakdown={breakdownForEvaluation}
            context="generator"
          />
      )}


      {error && (
        <Alert variant="destructive" className="mt-4 mx-6 mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showGrid && editableShifts && (
        <CardFooter className="flex flex-col items-stretch gap-4 pt-6">
            <Button onClick={handleSaveGeneratedShiftsClick} disabled={isActionDisabled || editableShifts.length === 0} className="w-full">
            {isSaving ? (
                <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando... </>
            ) : (
                <> <Save className="mr-2 h-4 w-4" /> Guardar Horario ({editableShifts.length} turnos) </>
            )}
            </Button>
        </CardFooter>
      )}
       {!showGrid && algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0 && !isLoadingConfig && configLoaded && (
         <CardFooter className="flex flex-col items-stretch gap-4 pt-0">
            <Button onClick={() => setShowGrid(true)} variant="outline" className="w-full" disabled={isActionDisabled}>
                <Eye className="mr-2 h-4 w-4" /> Ver y Editar Horario Generado ({algorithmGeneratedShifts.length} turnos)
            </Button>
         </CardFooter>
      )}

      <AlertDialog open={showInitialChoiceDialog} onOpenChange={(open) => { if (!open && (isSaving || isGenerating || isLoadingConfig)) return; setShowInitialChoiceDialog(open); if(!open) { setUserChoiceForExisting(null); }}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Horario Existente Encontrado</AlertDialogTitle>
            <AlertDialogDescription>
              Ya existe un horario activo para {currentLoadedSchedule?.serviceName || watchedSelectedService?.name} en {months.find(m=>m.value===watchedMonth)?.label || watchedMonth}/{watchedYear}. ¿Qué desea hacer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => handleInitialChoice('modify')} disabled={isSaving || isGenerating || isLoadingConfig} className="w-full sm:w-auto">
              <Edit className="mr-2 h-4 w-4" /> Modificar Horario Existente
            </Button>
            <Button onClick={() => handleInitialChoice('generate_new')} disabled={isSaving || isGenerating || isLoadingConfig} className="w-full sm:w-auto">
              <FilePlus2 className="mr-2 h-4 w-4" /> Generar Nuevo Horario
              <span className="text-xs ml-1 block sm:inline">(El actual se archivará al guardar)</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Guardado de Horario</AlertDialogTitle>
            {saveActionType === 'update_or_new_version' && currentLoadedSchedule && (
                <AlertDialogDescription>
                    Está modificando el horario activo para {currentLoadedSchedule.serviceName} ({months.find(m=>m.value===currentLoadedSchedule.month)?.label}/{currentLoadedSchedule.year}).<br/>
                    ¿Desea actualizar directamente este horario o guardarlo como una nueva versión activa (archivando la actual)?
                </AlertDialogDescription>
            )}
            {saveActionType === 'confirm_new_with_archive' && currentLoadedSchedule && (
                <AlertDialogDescription>
                    Se guardará el nuevo horario generado como activo. El horario activo anterior para {currentLoadedSchedule.serviceName} ({months.find(m=>m.value===currentLoadedSchedule.month)?.label}/{currentLoadedSchedule.year}) será archivado (marcado como inactivo). ¿Continuar?
                </AlertDialogDescription>
            )}
            {saveActionType === 'confirm_save_brand_new' && (
                 <AlertDialogDescription>
                    Se guardará este nuevo horario como activo para {watchedSelectedService?.name} ({months.find(m=>m.value===watchedMonth)?.label}/{watchedYear}). ¿Continuar?
                </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowSaveDialog(false)} disabled={isSaving} className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            {saveActionType === 'update_or_new_version' && (
                <>
                    <Button variant="outline" onClick={() => handleConfirmSave('update')} disabled={isSaving} className="w-full sm:w-auto">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit className="mr-2 h-4 w-4" />}
                         Actualizar Existente
                    </Button>
                    <AlertDialogAction onClick={() => handleConfirmSave('new_version')} disabled={isSaving} className="w-full sm:w-auto">
                       {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
                        Guardar como Nueva Versión
                    </AlertDialogAction>
                </>
            )}
             {(saveActionType === 'confirm_new_with_archive' || saveActionType === 'confirm_save_brand_new') && (
                 <AlertDialogAction onClick={() => handleConfirmSave('new_version')} disabled={isSaving} className="w-full sm:w-auto">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                     Confirmar y Guardar
                </AlertDialogAction>
             )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Card>
  );
}

