
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
import { Loader2, Save, CalendarDays, Eye, Bot, Info, AlertTriangle, Edit, FilePlus2, Archive, UploadCloud, FileText, Edit3 } from 'lucide-react';
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
import { getActiveMonthlySchedule, getDraftMonthlySchedule, saveNewActiveSchedule, saveOrUpdateDraftSchedule, updateExistingActiveSchedule, generateScheduleKey, deleteActiveSchedule } from '@/lib/firebase/monthlySchedules';
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
  const [currentLoadedScheduleIsDraft, setCurrentLoadedScheduleIsDraft] = useState<boolean>(false);
  const [previousMonthSchedule, setPreviousMonthSchedule] = useState<MonthlySchedule | null>(null);
  const [showInitialChoiceDialog, setShowInitialChoiceDialog] = useState(false);
  const [userChoiceForExisting, setUserChoiceForExisting] = useState<'modify_active' | 'modify_draft' | 'generate_new' | null>(null);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveActionType, setSaveActionType] = useState<'save_draft' | 'publish_draft' | 'publish_new' | 'update_active' | 'new_active_version' | null>(null);

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
    setCurrentLoadedScheduleIsDraft(false);
    setPreviousMonthSchedule(null);
    setConfigLoaded(false);

    try {
      let scheduleToLoad: MonthlySchedule | null = await getActiveMonthlySchedule(year, month, serviceId);
      let isDraft = false;
      if (!scheduleToLoad) {
        scheduleToLoad = await getDraftMonthlySchedule(year, month, serviceId);
        isDraft = true;
      }

      setCurrentLoadedSchedule(scheduleToLoad);
      setCurrentLoadedScheduleIsDraft(isDraft && !!scheduleToLoad); // True if a draft was loaded

      if (scheduleToLoad) {
        setGeneratedScore(scheduleToLoad.score ?? null);
        setGeneratedViolations(scheduleToLoad.violations ?? null);
        setGeneratedScoreBreakdown(scheduleToLoad.scoreBreakdown ?? null);
      }


      const currentMonthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const prevMonthDate = subMonths(currentMonthDate, 1);
      const prevMonthYearStr = format(prevMonthDate, 'yyyy');
      const prevMonthMonthStr = format(prevMonthDate, 'M');
      const prevSchedule = await getActiveMonthlySchedule(prevMonthYearStr, prevMonthMonthStr, serviceId);
      setPreviousMonthSchedule(prevSchedule);

      setConfigLoaded(true);
      setLoadedConfigValues({serviceId, month, year});

      if (scheduleToLoad) {
        setShowInitialChoiceDialog(true);
      } else {
        setShowInitialChoiceDialog(false);
        setUserChoiceForExisting(null); // No existing schedule, so user will generate new
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

  const handleConfirmSave = async () => {
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
        const versionToSave = currentLoadedSchedule?.version; // Maintain version if updating, new version handles its own logic

        const scoreBreakdownToSave = generatedScoreBreakdown ?? currentLoadedSchedule?.scoreBreakdown;
        const plainScoreBreakdownToSave = scoreBreakdownToSave
            ? { serviceRules: scoreBreakdownToSave.serviceRules, employeeWellbeing: scoreBreakdownToSave.employeeWellbeing }
            : undefined;

        const scheduleDataPayload: Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'> = {
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

        if (saveActionType === 'save_draft') {
            savedOrUpdatedSchedule = await saveOrUpdateDraftSchedule(scheduleDataPayload, currentLoadedScheduleIsDraft ? currentLoadedSchedule?.id : undefined);
            toast({ title: "Borrador Guardado", description: `El borrador para ${watchedSelectedService.name} - ${months.find(m=>m.value===watchedMonth)?.label}/${watchedYear} se guardó.` });
            setCurrentLoadedScheduleIsDraft(true);
        } else if (saveActionType === 'publish_draft' || saveActionType === 'publish_new' || saveActionType === 'new_active_version') {
            // For publishing a draft, or publishing a brand new schedule, or creating new version of active
            // previousActiveScheduleIdToArchive is important if we are replacing an existing active schedule
            // If publishing a draft, the draft itself (currentLoadedSchedule.id if it's a draft) needs to be archived/deleted or updated.
            // The saveNewActiveSchedule will handle archiving other 'active' or 'draft' schedules with the same key.
            
            // If we were editing a draft (currentLoadedScheduleIsDraft = true, currentLoadedSchedule.id exists), that draft becomes inactive.
            const idToArchive = currentLoadedSchedule?.id;

            savedOrUpdatedSchedule = await saveNewActiveSchedule(scheduleDataPayload, idToArchive);
            toast({ title: "Horario Publicado", description: `El horario para ${watchedSelectedService.name} - ${months.find(m=>m.value===watchedMonth)?.label}/${watchedYear} se publicó como activo.` });
            setCurrentLoadedScheduleIsDraft(false);
        } else if (saveActionType === 'update_active' && currentLoadedSchedule && !currentLoadedScheduleIsDraft) {
            await updateExistingActiveSchedule(currentLoadedSchedule.id, editableShifts, responseTextToSave, scoreToSave, violationsToSave, plainScoreBreakdownToSave);
            toast({ title: "Horario Activo Actualizado", description: "El horario activo ha sido actualizado directamente." });
            savedOrUpdatedSchedule = await getActiveMonthlySchedule(watchedYear, watchedMonth, watchedServiceId); // Re-fetch to get latest
            setCurrentLoadedScheduleIsDraft(false);
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
        setSaveActionType(null);
    }
  };

  const handleSaveGeneratedShiftsClick = () => {
    if (!editableShifts || editableShifts.length === 0) {
      setError("No hay turnos para guardar.");
      toast({ variant: "destructive", title: "Error", description: "No hay turnos generados o editados para guardar." });
      return;
    }
    // Logic to determine saveActionType is now within the dialog triggers
    setShowSaveDialog(true);
  };

  const handleBackToConfig = () => {
    setShowGrid(false);
    // Consider resetting generated data if user goes back from grid
    setAlgorithmGeneratedShifts(null);
    // setEditableShifts(null); // Keep editable shifts if user wants to come back to grid without regenerating
    // setGeneratedResponseText(null);
    // setGeneratedScore(null);
    // setGeneratedViolations(null);
    // setGeneratedScoreBreakdown(null);
  };

  const handleInitialChoice = (choice: 'modify_active' | 'modify_draft' | 'generate_new') => {
    setShowInitialChoiceDialog(false);
    setUserChoiceForExisting(choice);
    if ((choice === 'modify_active' || choice === 'modify_draft') && currentLoadedSchedule) {
        setEditableShifts(currentLoadedSchedule.shifts ? [...currentLoadedSchedule.shifts] : []);
        setGeneratedResponseText(currentLoadedSchedule.responseText || "");
        setGeneratedScore(currentLoadedSchedule.score ?? null);
        setGeneratedViolations(currentLoadedSchedule.violations ?? null);
        setGeneratedScoreBreakdown(currentLoadedSchedule.scoreBreakdown ?? null);
        setShowGrid(true);
    } else { // generate_new
        setEditableShifts(null);
        setAlgorithmGeneratedShifts(null);
        // Keep currentLoadedSchedule for context, but don't prefill grid
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
  // Can generate if config is loaded AND ( (no schedule was loaded at all) OR (user chose to generate new) ) AND form selection hasn't changed
  const canGenerate = configLoaded && (!currentLoadedSchedule || userChoiceForExisting === 'generate_new') && !isFormSelectionChanged();

  const scoreForEvaluation = showGrid && editableShifts ? (generatedScore ?? currentLoadedSchedule?.score) : (algorithmGeneratedShifts ? generatedScore : currentLoadedSchedule?.score);
  const violationsForEvaluation = showGrid && editableShifts ? (generatedViolations ?? currentLoadedSchedule?.violations) : (algorithmGeneratedShifts ? generatedViolations : currentLoadedSchedule?.violations);
  const breakdownForEvaluation = showGrid && editableShifts ? (generatedScoreBreakdown ?? currentLoadedSchedule?.scoreBreakdown) : (algorithmGeneratedShifts ? generatedScoreBreakdown : currentLoadedSchedule?.scoreBreakdown);

  const getSaveDialogOptions = () => {
    const options = [];
    if (currentLoadedScheduleIsDraft && currentLoadedSchedule) { // Loaded a draft, now editing it
        options.push({
            label: "Guardar Cambios al Borrador",
            action: () => { setSaveActionType('save_draft'); handleConfirmSave(); },
            icon: <FileText className="mr-2 h-4 w-4" />
        });
        options.push({
            label: "Publicar Borrador",
            action: () => { setSaveActionType('publish_draft'); handleConfirmSave(); },
            icon: <UploadCloud className="mr-2 h-4 w-4" />,
            variant: "default"
        });
    } else if (!currentLoadedScheduleIsDraft && currentLoadedSchedule) { // Loaded an active schedule, now editing it
        options.push({
            label: "Actualizar Horario Activo",
            action: () => { setSaveActionType('update_active'); handleConfirmSave(); },
            icon: <Edit3 className="mr-2 h-4 w-4" />
        });
        options.push({
            label: "Guardar como Nueva Versión Activa",
            action: () => { setSaveActionType('new_active_version'); handleConfirmSave(); },
            icon: <Archive className="mr-2 h-4 w-4" />,
            variant: "default"
        });
         options.push({
            label: "Guardar como Borrador Nuevo",
            action: () => { setSaveActionType('save_draft'); handleConfirmSave(); }, // This will create a new draft
            icon: <FileText className="mr-2 h-4 w-4" />,
            variant: "outline"
        });
    } else { // No schedule loaded (generating brand new) OR generated new after choosing to
        options.push({
            label: "Guardar como Borrador",
            action: () => { setSaveActionType('save_draft'); handleConfirmSave(); },
            icon: <FileText className="mr-2 h-4 w-4" />
        });
        options.push({
            label: "Guardar y Publicar",
            action: () => { setSaveActionType('publish_new'); handleConfirmSave(); },
            icon: <UploadCloud className="mr-2 h-4 w-4" />,
            variant: "default"
        });
    }
    return options;
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
              Seleccione servicio, mes y año, luego "Cargar Configuración". Podrá modificar un borrador/activo existente o generar uno nuevo.
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

                  {configLoaded && currentLoadedSchedule && !showInitialChoiceDialog && (
                    <Alert variant={currentLoadedScheduleIsDraft ? "default" : "default"} className="mt-4 bg-opacity-20">
                      <Info className="h-4 w-4" />
                      <AlertTitle>
                        {currentLoadedScheduleIsDraft ? "Borrador Cargado" : "Horario Activo Cargado"}
                      </AlertTitle>
                      <AlertDescription>
                        Se ha cargado un horario {currentLoadedScheduleIsDraft ? "borrador" : "activo"} para {currentLoadedSchedule.serviceName} ({months.find(m=>m.value===currentLoadedSchedule.month)?.label}/{currentLoadedSchedule.year}).
                        Puntuación: {currentLoadedSchedule.score?.toFixed(0) ?? "N/A"}.
                        {userChoiceForExisting === 'modify_active' && " Puede modificarlo y actualizarlo o guardarlo como nueva versión."}
                        {userChoiceForExisting === 'modify_draft' && " Puede modificarlo y guardar los cambios o publicarlo."}
                      </AlertDescription>
                    </Alert>
                  )}

                  { (configLoaded && (userChoiceForExisting === 'generate_new' || (!currentLoadedSchedule && !showInitialChoiceDialog))) && (
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
            onShiftsChange={(updatedShifts) => {
                setEditableShifts(updatedShifts);
                // Potentially re-evaluate score/violations here if desired on grid change
                // For now, evaluation data is tied to generation or load
            }}
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

      <AlertDialog open={showInitialChoiceDialog} onOpenChange={(open) => { if (!open && (isSaving || isGenerating || isLoadingConfig)) return; setShowInitialChoiceDialog(open); if(!open && userChoiceForExisting === null) { setConfigLoaded(false); /* Reset config loaded if dialog closed without choice */ }}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Horario Existente Encontrado</AlertDialogTitle>
            <AlertDialogDescription>
              Ya existe un horario {currentLoadedScheduleIsDraft ? 'borrador' : 'activo'} para {currentLoadedSchedule?.serviceName || watchedSelectedService?.name} en {months.find(m=>m.value===watchedMonth)?.label || watchedMonth}/{watchedYear}.
              Puntuación: {currentLoadedSchedule?.score?.toFixed(0) ?? "N/A"}. ¿Qué desea hacer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-col gap-2"> {/* Changed to flex-col for all sizes */}
            <Button variant="outline" onClick={() => handleInitialChoice(currentLoadedScheduleIsDraft ? 'modify_draft' : 'modify_active')} disabled={isActionDisabled} className="w-full">
              <Edit className="mr-2 h-4 w-4" /> Modificar Horario {currentLoadedScheduleIsDraft ? 'Borrador' : 'Activo'} Existente
            </Button>
            <Button onClick={() => handleInitialChoice('generate_new')} disabled={isActionDisabled} className="w-full">
              <FilePlus2 className="mr-2 h-4 w-4" /> Generar Nuevo Horario
              <span className="text-xs ml-1 block sm:inline">(El actual {currentLoadedScheduleIsDraft ? 'borrador' : 'activo'} no se modificará hasta que guarde/publique el nuevo)</span>
            </Button>
            <AlertDialogCancel onClick={() => {setUserChoiceForExisting(null); setConfigLoaded(false);}} disabled={isActionDisabled} className="mt-2 w-full">Cancelar Carga</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Guardado de Horario</AlertDialogTitle>
             <AlertDialogDescription>
                Seleccione una opción para guardar el horario actual ({editableShifts?.length || 0} turnos) para {watchedSelectedService?.name} ({months.find(m=>m.value===watchedMonth)?.label}/{watchedYear}).
             </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 my-4">
            {getSaveDialogOptions().map(opt => (
                <Button
                    key={opt.label}
                    variant={opt.variant as any || "outline"}
                    onClick={opt.action}
                    disabled={isSaving}
                    className="w-full justify-start text-left"
                >
                    {isSaving && saveActionType === opt.label.toLowerCase().replace(/ /g, '_') ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : opt.icon}
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
