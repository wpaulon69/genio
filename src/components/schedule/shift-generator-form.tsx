
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
import { Loader2, Save, CalendarDays, Eye, Bot, Info, AlertTriangle, Edit, FilePlus2, Archive, UploadCloud, FileText, Edit3, BookLock, BookMarked } from 'lucide-react';
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
import { 
    getPublishedMonthlySchedule, 
    getDraftMonthlySchedule, 
    saveOrUpdateDraftSchedule, 
    publishSchedule,
    updatePublishedScheduleDirectly,
    archiveSchedule,
    generateScheduleKey 
} from '@/lib/firebase/monthlySchedules';
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

  const [currentLoadedPublishedSchedule, setCurrentLoadedPublishedSchedule] = useState<MonthlySchedule | null>(null);
  const [currentLoadedDraftSchedule, setCurrentLoadedDraftSchedule] = useState<MonthlySchedule | null>(null);
  const [previousMonthSchedule, setPreviousMonthSchedule] = useState<MonthlySchedule | null>(null);
  
  const [showInitialChoiceDialog, setShowInitialChoiceDialog] = useState(false);
  const [userChoiceForExisting, setUserChoiceForExisting] = useState<'modify_published' | 'use_draft' | 'generate_new_draft' | null>(null);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveActionType, setSaveActionType] = useState<'save_draft' | 'publish_draft' | 'publish_new_from_scratch' | 'publish_modified_published' | null>(null);
  
  const [configLoaded, setConfigLoaded] = useState(false);
  const [loadedConfigValues, setLoadedConfigValues] = useState<ShiftGenerationConfigFormData | null>(null);
  const [currentEditingSource, setCurrentEditingSource] = useState<'none' | 'published' | 'draft' | 'new'>('none');


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

  const resetScheduleState = () => {
    setAlgorithmGeneratedShifts(null);
    setEditableShifts(null);
    setGeneratedResponseText(null);
    setGeneratedScore(null);
    setGeneratedViolations(null);
    setGeneratedScoreBreakdown(null);
    setShowGrid(false);
    setUserChoiceForExisting(null);
    setCurrentLoadedPublishedSchedule(null);
    setCurrentLoadedDraftSchedule(null);
    setPreviousMonthSchedule(null);
    setConfigLoaded(false);
    setCurrentEditingSource('none');
  };

  const handleLoadConfiguration = async () => {
    const { serviceId, month, year } = form.getValues();
    if (!serviceId || !month || !year) {
      setError("Por favor, seleccione servicio, mes y año.");
      return;
    }

    setIsLoadingConfig(true);
    setError(null);
    resetScheduleState(); // Reset all schedule related state

    try {
      const published = await getPublishedMonthlySchedule(year, month, serviceId);
      const draft = await getDraftMonthlySchedule(year, month, serviceId);

      setCurrentLoadedPublishedSchedule(published);
      setCurrentLoadedDraftSchedule(draft);

      const currentMonthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const prevMonthDate = subMonths(currentMonthDate, 1);
      const prevMonthYearStr = format(prevMonthDate, 'yyyy');
      const prevMonthMonthStr = format(prevMonthDate, 'M'); // 'M' for month 1-12
      const prevSchedule = await getPublishedMonthlySchedule(prevMonthYearStr, prevMonthMonthStr, serviceId);
      setPreviousMonthSchedule(prevSchedule);

      setConfigLoaded(true);
      setLoadedConfigValues({serviceId, month, year});

      if (published || draft) {
        setShowInitialChoiceDialog(true);
      } else {
        // No existing published or draft, proceed to generate new draft context
        setUserChoiceForExisting('generate_new_draft');
        setCurrentEditingSource('new');
        setShowInitialChoiceDialog(false);
      }
    } catch (e) {
      console.error("Error cargando configuración de horarios:", e);
      setError("Error al cargar configuración de horarios.");
      resetScheduleState(); // Ensure clean state on error
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleInitialChoice = (choice: 'modify_published' | 'use_draft' | 'generate_new_draft') => {
    setShowInitialChoiceDialog(false);
    setUserChoiceForExisting(choice);
    
    // Clear any previously generated/edited data before loading
    setAlgorithmGeneratedShifts(null);
    setEditableShifts(null);
    setGeneratedResponseText(null);
    setGeneratedScore(null);
    setGeneratedViolations(null);
    setGeneratedScoreBreakdown(null);

    if (choice === 'modify_published' && currentLoadedPublishedSchedule) {
        setCurrentEditingSource('published');
        setEditableShifts(currentLoadedPublishedSchedule.shifts ? [...currentLoadedPublishedSchedule.shifts] : []);
        setGeneratedResponseText(currentLoadedPublishedSchedule.responseText || "");
        setGeneratedScore(currentLoadedPublishedSchedule.score ?? null);
        setGeneratedViolations(currentLoadedPublishedSchedule.violations ?? null);
        setGeneratedScoreBreakdown(currentLoadedPublishedSchedule.scoreBreakdown ?? null);
        setShowGrid(true);
    } else if (choice === 'use_draft' && currentLoadedDraftSchedule) {
        setCurrentEditingSource('draft');
        setEditableShifts(currentLoadedDraftSchedule.shifts ? [...currentLoadedDraftSchedule.shifts] : []);
        setGeneratedResponseText(currentLoadedDraftSchedule.responseText || "");
        setGeneratedScore(currentLoadedDraftSchedule.score ?? null);
        setGeneratedViolations(currentLoadedDraftSchedule.violations ?? null);
        setGeneratedScoreBreakdown(currentLoadedDraftSchedule.scoreBreakdown ?? null);
        setShowGrid(true);
    } else { // generate_new_draft
        setCurrentEditingSource('new');
        setShowGrid(false); // Don't show grid, user needs to click "Generate"
    }
  };

  const handleGenerateSubmit = async (data: ShiftGenerationConfigFormData) => {
    if (!watchedSelectedService) {
        setError("Por favor, seleccione un servicio válido y cargue la configuración.");
        return;
    }
    if (isLoadingHolidays) {
        setError("Esperando a que cargue la lista de feriados."); return;
    }
    if (errorHolidays) {
        setError("Error al cargar feriados. No se puede generar el horario."); return;
    }
    if (loadedConfigValues && (data.serviceId !== loadedConfigValues.serviceId || data.month !== loadedConfigValues.month || data.year !== loadedConfigValues.year)) {
        setError("La selección ha cambiado. Por favor, haga clic en 'Cargar Configuración' antes de generar.");
        toast({ variant: "destructive", title: "Selección Cambiada", description: "Recargue la configuración."});
        return;
    }
    if (!configLoaded) { // Removed check for currentLoadedSchedule as generation is for new draft
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
    setShowGrid(false); // Reset grid visibility before new generation
    setCurrentEditingSource('new'); // Mark as new for saving logic if user started from scratch

    try {
      const result = await generateAlgorithmicSchedule(
        watchedSelectedService,
        data.month,
        data.year,
        allEmployees,
        holidays,
        previousMonthSchedule?.shifts || null // Pass previous month's PUBLISHED shifts
      );
      setGeneratedResponseText(result.responseText);
      setGeneratedScore(result.score);
      setGeneratedViolations(result.violations);
      setGeneratedScoreBreakdown(result.scoreBreakdown);

      if (result.generatedShifts && result.generatedShifts.length > 0) {
        setAlgorithmGeneratedShifts(result.generatedShifts);
        setEditableShifts(result.generatedShifts); // Pre-fill editable with generated
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

  const handleConfirmSave = async () => {
    setShowSaveDialog(false);
    if (!editableShifts || !watchedSelectedService || !watchedYear || !watchedMonth) {
        setError("Faltan datos para guardar el horario.");
        toast({ variant: "destructive", title: "Error", description: "Faltan datos para guardar el horario." });
        return;
    }
    setIsSaving(true);
    setError(null);

    const schedulePayloadBase = {
        scheduleKey: generateScheduleKey(watchedYear, watchedMonth, watchedServiceId),
        year: watchedYear,
        month: watchedMonth,
        serviceId: watchedServiceId,
        serviceName: watchedSelectedService.name,
        shifts: editableShifts,
        responseText: generatedResponseText || (currentEditingSource === 'draft' && currentLoadedDraftSchedule?.responseText) || (currentEditingSource === 'published' && currentLoadedPublishedSchedule?.responseText) || "Horario guardado.",
        score: generatedScore ?? (currentEditingSource === 'draft' && currentLoadedDraftSchedule?.score) ?? (currentEditingSource === 'published' && currentLoadedPublishedSchedule?.score) ?? 0,
        violations: generatedViolations ?? (currentEditingSource === 'draft' && currentLoadedDraftSchedule?.violations) ?? (currentEditingSource === 'published' && currentLoadedPublishedSchedule?.violations) ?? [],
        scoreBreakdown: generatedScoreBreakdown ?? (currentEditingSource === 'draft' && currentLoadedDraftSchedule?.scoreBreakdown) ?? (currentEditingSource === 'published' && currentLoadedPublishedSchedule?.scoreBreakdown),
        version: 0, // Version will be handled by backend logic or based on existing
        createdAt: 0, // Will be set by backend or based on existing
    };

    try {
        let savedSchedule: MonthlySchedule | null = null;

        if (saveActionType === 'save_draft') {
            const existingDraftIdToUpdate = (currentEditingSource === 'draft' && currentLoadedDraftSchedule) ? currentLoadedDraftSchedule.id : undefined;
            savedSchedule = await saveOrUpdateDraftSchedule(schedulePayloadBase, existingDraftIdToUpdate);
            setCurrentLoadedDraftSchedule(savedSchedule);
            setCurrentEditingSource('draft'); // Now editing this saved draft
            toast({ title: "Borrador Guardado", description: `El borrador para ${watchedSelectedService.name} - ${months.find(m=>m.value===watchedMonth)?.label}/${watchedYear} se guardó.` });
        } else if (saveActionType === 'publish_draft') { // Publishing a draft
            const draftIdToArchive = (currentEditingSource === 'draft' && currentLoadedDraftSchedule) ? currentLoadedDraftSchedule.id : undefined;
            savedSchedule = await publishSchedule(schedulePayloadBase, draftIdToArchive);
            setCurrentLoadedPublishedSchedule(savedSchedule);
            setCurrentLoadedDraftSchedule(null); // Draft is now archived/published
            setCurrentEditingSource('published'); // Now technically viewing the published one
            toast({ title: "Borrador Publicado", description: `El horario borrador se publicó como activo.` });
        } else if (saveActionType === 'publish_new_from_scratch') { // Publishing a brand new schedule
            savedSchedule = await publishSchedule(schedulePayloadBase); // No draft ID to archive
            setCurrentLoadedPublishedSchedule(savedSchedule);
            setCurrentLoadedDraftSchedule(null);
            setCurrentEditingSource('published');
            toast({ title: "Horario Publicado", description: `El nuevo horario se publicó como activo.` });
        } else if (saveActionType === 'publish_modified_published') { // Modifying a published one directly (creates new version)
            if (currentLoadedPublishedSchedule) {
                 // Pass the ID of the currently loaded published schedule to correctly archive it
                savedSchedule = await publishSchedule(schedulePayloadBase, undefined); // The publishSchedule will archive the current published based on key
                setCurrentLoadedPublishedSchedule(savedSchedule);
                setCurrentLoadedDraftSchedule(null); // No draft involved in this direct publish path
                setCurrentEditingSource('published');
                toast({ title: "Horario Publicado Actualizado", description: "Se creó una nueva versión del horario publicado." });
            } else {
                 throw new Error("No hay horario publicado cargado para actualizar.");
            }
        }

        if (savedSchedule) {
            setEditableShifts([...savedSchedule.shifts]);
            setGeneratedResponseText(savedSchedule.responseText ?? null);
            setGeneratedScore(savedSchedule.score ?? null);
            setGeneratedViolations(savedSchedule.violations ?? null);
            setGeneratedScoreBreakdown(savedSchedule.scoreBreakdown ?? null);
            setLoadedConfigValues({serviceId: watchedServiceId, month: watchedMonth, year: watchedYear}); // Re-affirm loaded config
            queryClient.invalidateQueries({ queryKey: ['monthlySchedule', watchedYear, watchedMonth, watchedServiceId] }); // Use specific key for viewer
            queryClient.invalidateQueries({ queryKey: ['publishedMonthlySchedule', watchedYear, watchedMonth, watchedServiceId] });
            queryClient.invalidateQueries({ queryKey: ['draftMonthlySchedule', watchedYear, watchedMonth, watchedServiceId] });
        }
        setShowGrid(true);

    } catch (e) {
        console.error("Error guardando el horario:", e);
        const message = e instanceof Error ? e.message : "Ocurrió un error desconocido al guardar el horario.";
        setError(message);
        toast({ variant: "destructive", title: "Error al Guardar", description: message });
    } finally {
        setIsSaving(false);
        setSaveActionType(null);
    }
  };


  const handleSaveGeneratedShiftsClick = () => {
    if (!editableShifts || editableShifts.length === 0) {
      setError("No hay turnos para guardar.");
      toast({ variant: "destructive", title: "Error", description: "No hay turnos generados o editados para guardar." });
      return;
    }
    setShowSaveDialog(true);
  };

  const handleBackToConfig = () => {
    setShowGrid(false);
    // Do not reset generated data if user might want to come back to grid
  };

  const isFormSelectionChanged = () => {
    if (!loadedConfigValues) return false; // If nothing loaded, any selection is "new"
    const currentFormValues = form.getValues();
    return currentFormValues.serviceId !== loadedConfigValues.serviceId ||
           currentFormValues.month !== loadedConfigValues.month ||
           currentFormValues.year !== loadedConfigValues.year;
  };

  const isActionDisabled = isGenerating || isSaving || isLoadingHolidays || !!errorHolidays || isLoadingConfig;
  
  // Can generate if config is loaded AND user chose to generate new OR no schedules were loaded
  const canGenerate = configLoaded && (userChoiceForExisting === 'generate_new_draft' || (!currentLoadedPublishedSchedule && !currentLoadedDraftSchedule)) && !isFormSelectionChanged();

  const scoreForEvaluation = showGrid && editableShifts ? (generatedScore) : (algorithmGeneratedShifts ? generatedScore : null);
  const violationsForEvaluation = showGrid && editableShifts ? (generatedViolations) : (algorithmGeneratedShifts ? generatedViolations : null);
  const breakdownForEvaluation = showGrid && editableShifts ? (generatedScoreBreakdown) : (algorithmGeneratedShifts ? generatedScoreBreakdown : null);
  
  const getSaveDialogOptions = () => {
    const options = [];
    if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) {
        options.push({
            label: "Guardar Cambios al Borrador",
            action: () => { setSaveActionType('save_draft'); handleConfirmSave(); },
            icon: <FileText className="mr-2 h-4 w-4" />,
            variant: "outline"
        });
        options.push({
            label: "Publicar Borrador",
            action: () => { setSaveActionType('publish_draft'); handleConfirmSave(); },
            icon: <UploadCloud className="mr-2 h-4 w-4" />
        });
    } else if (currentEditingSource === 'published' && currentLoadedPublishedSchedule) {
        options.push({
            label: "Guardar como Nueva Versión Publicada",
            action: () => { setSaveActionType('publish_modified_published'); handleConfirmSave(); },
            icon: <UploadCloud className="mr-2 h-4 w-4" />
        });
         options.push({
            label: "Guardar Cambios como Borrador Nuevo",
            action: () => { setSaveActionType('save_draft'); handleConfirmSave(); },
            icon: <FileText className="mr-2 h-4 w-4" />,
            variant: "outline"
        });
    } else { // currentEditingSource === 'new' or nothing specific loaded for editing
        options.push({
            label: "Guardar como Borrador",
            action: () => { setSaveActionType('save_draft'); handleConfirmSave(); },
            icon: <FileText className="mr-2 h-4 w-4" />,
            variant: "outline"
        });
        options.push({
            label: "Guardar y Publicar Directamente",
            action: () => { setSaveActionType('publish_new_from_scratch'); handleConfirmSave(); },
            icon: <UploadCloud className="mr-2 h-4 w-4" />
        });
    }
    return options;
  };

  const getInitialChoiceDialogDescription = () => {
    let desc = "Se encontraron horarios existentes: ";
    if (currentLoadedPublishedSchedule) {
      desc += `Un horario PUBLICADO (v${currentLoadedPublishedSchedule.version}, Puntuación: ${currentLoadedPublishedSchedule.score?.toFixed(0) ?? "N/A"}). `;
    }
    if (currentLoadedDraftSchedule) {
      desc += `Un horario BORRADOR (v${currentLoadedDraftSchedule.version}, Puntuación: ${currentLoadedDraftSchedule.score?.toFixed(0) ?? "N/A"}). `;
    }
    desc += "¿Qué desea hacer?";
    return desc;
  };


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
              Seleccione servicio, mes y año, luego "Cargar Configuración". Podrá ver/modificar horarios publicados/borradores, o generar uno nuevo.
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
                          <Select onValueChange={(value) => { field.onChange(value); resetScheduleState(); }} value={field.value || ''} disabled={isActionDisabled || showInitialChoiceDialog}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un servicio" /></SelectTrigger></FormControl>
                            <SelectContent>{allServices.map(service => (<SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>))}</SelectContent>
                          </Select><FormMessage />
                        </FormItem>)} />
                    <FormField control={form.control} name="month" render={({ field }) => (
                        <FormItem> <FormLabel>Mes</FormLabel>
                          <Select onValueChange={(value) => { field.onChange(value); resetScheduleState(); }} value={field.value} disabled={isActionDisabled || showInitialChoiceDialog}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un mes" /></SelectTrigger></FormControl>
                            <SelectContent>{months.map(m => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent>
                          </Select><FormMessage />
                        </FormItem>)} />
                    <FormField control={form.control} name="year" render={({ field }) => (
                        <FormItem> <FormLabel>Año</FormLabel>
                          <Select onValueChange={(value) => { field.onChange(value); resetScheduleState(); }} value={field.value} disabled={isActionDisabled || showInitialChoiceDialog}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccione un año" /></SelectTrigger></FormControl>
                            <SelectContent>{years.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent>
                          </Select><FormMessage />
                        </FormItem>)} />
                  </div>

                   <Button type="button" onClick={handleLoadConfiguration} disabled={isActionDisabled || showInitialChoiceDialog || isLoadingHolidays} className="w-full md:w-auto">
                    {isLoadingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                     Cargar Configuración
                  </Button>

                  {configLoaded && (currentLoadedPublishedSchedule || currentLoadedDraftSchedule) && !showInitialChoiceDialog && userChoiceForExisting && (
                    <Alert variant={"default"} className="mt-4 bg-opacity-20">
                      <Info className="h-4 w-4" />
                      <AlertTitle>
                        Contexto Actual: { 
                           userChoiceForExisting === 'modify_published' && currentLoadedPublishedSchedule ? `Modificando Horario Publicado (v${currentLoadedPublishedSchedule.version})` :
                           userChoiceForExisting === 'use_draft' && currentLoadedDraftSchedule ? `Modificando Borrador Existente (v${currentLoadedDraftSchedule.version})` :
                           userChoiceForExisting === 'generate_new_draft' ? "Preparado para Generar Nuevo Borrador" : "Estado Desconocido"
                        }
                      </AlertTitle>
                      <AlertDescription>
                        { userChoiceForExisting === 'modify_published' && currentLoadedPublishedSchedule && `Se cargó el horario publicado. Cualquier guardado creará una nueva versión o un nuevo borrador.`}
                        { userChoiceForExisting === 'use_draft' && currentLoadedDraftSchedule && `Se cargó el borrador existente. Puede guardarlo o publicarlo.`}
                        { userChoiceForExisting === 'generate_new_draft' && `Haga clic en "Generar Horario" para crear un nuevo borrador.`}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  { (configLoaded && (userChoiceForExisting === 'generate_new_draft' || (!currentLoadedPublishedSchedule && !currentLoadedDraftSchedule))) && (
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
                { canGenerate && !showInitialChoiceDialog && (
                    <Button type="submit" disabled={isActionDisabled || !watchedServiceId || showInitialChoiceDialog || isFormSelectionChanged()} className="w-full">
                        {isGenerating ? ( <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando Horario... </>
                        ) : ( <> <CalendarDays className="mr-2 h-4 w-4" /> Generar Nuevo Borrador para {watchedSelectedService?.name || ''} </> )}
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
            onShiftsChange={(updatedShifts) => {
                setEditableShifts(updatedShifts);
            }}
            onBackToConfig={handleBackToConfig}
          />
        )
      )}

      {((showGrid && editableShifts) || (algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0)) && (
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

      {showGrid && editableShifts && configLoaded && (
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

      <AlertDialog open={showInitialChoiceDialog} onOpenChange={(open) => { if (!open && (isSaving || isGenerating || isLoadingConfig)) return; setShowInitialChoiceDialog(open); if(!open && userChoiceForExisting === null) { resetScheduleState(); }}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Horario(s) Existente(s) Encontrado(s)</AlertDialogTitle>
            <AlertDialogDescription>
              {getInitialChoiceDialogDescription()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 my-4">
            {currentLoadedPublishedSchedule && (
                <Button variant="outline" onClick={() => handleInitialChoice('modify_published')} disabled={isActionDisabled} className="w-full justify-start text-left">
                    <BookMarked className="mr-2 h-4 w-4" /> Modificar Horario Publicado (v{currentLoadedPublishedSchedule.version})
                </Button>
            )}
            {currentLoadedDraftSchedule && (
                 <Button variant="outline" onClick={() => handleInitialChoice('use_draft')} disabled={isActionDisabled} className="w-full justify-start text-left">
                     <Edit className="mr-2 h-4 w-4" /> Continuar con Borrador Existente (v{currentLoadedDraftSchedule.version})
                 </Button>
            )}
            <Button onClick={() => handleInitialChoice('generate_new_draft')} disabled={isActionDisabled} className="w-full justify-start text-left">
                <FilePlus2 className="mr-2 h-4 w-4" /> Generar Nuevo Borrador
                <span className="text-xs ml-1 text-muted-foreground">
                    {currentLoadedDraftSchedule ? "(El borrador actual NO se modificará hasta que guarde el nuevo)" : ""}
                    {currentLoadedPublishedSchedule && !currentLoadedDraftSchedule ? "(El publicado actual NO se modificará hasta que publique el nuevo)" : ""}
                </span>
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setUserChoiceForExisting(null); resetScheduleState();}} disabled={isActionDisabled} className="w-full">Cancelar Carga</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Guardado de Horario</AlertDialogTitle>
             <AlertDialogDescription>
                Seleccione una opción para guardar el horario actual ({editableShifts?.length || 0} turnos) para {watchedSelectedService?.name} ({months.find(m=>m.value===watchedMonth)?.label}/{watchedYear}).
                Puntuación actual: {scoreForEvaluation?.toFixed(0) ?? "N/A"}.
             </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 my-4">
            {getSaveDialogOptions().map(opt => (
                <Button
                    key={opt.label}
                    variant={opt.variant as any || "default"}
                    onClick={opt.action}
                    disabled={isSaving}
                    className="w-full justify-start text-left"
                >
                    {isSaving && saveActionType === opt.label.toLowerCase().replace(/\s+/g, '_').replace(/[(),]/g, '') ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : opt.icon}
                    {opt.label}
                </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowSaveDialog(false); setSaveActionType(null); }} disabled={isSaving}>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Card>
  );
}
