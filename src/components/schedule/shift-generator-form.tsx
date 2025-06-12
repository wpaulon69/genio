
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
import { Loader2, Save, CalendarDays, Eye, Bot, Info, AlertTriangle, Edit, FilePlus2, UploadCloud, FileText, Edit3, BookMarked, Trash2, RefreshCw, ClipboardCheck } from 'lucide-react';
import { generateAlgorithmicSchedule, evaluateScheduleMetrics } from '@/lib/scheduler/algorithmic-scheduler';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Employee, Service, Holiday, MonthlySchedule, ScoreBreakdown, ScheduleViolation } from '@/lib/types';
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
    generateScheduleKey,
    dangerouslyDeleteAllSchedulesForKey
} from '@/lib/firebase/monthlySchedules';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


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

type SaveActionType = 'save_draft' | 'publish_draft' | 'publish_new_from_scratch' | 'publish_modified_published';


const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());
const months = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString(),
  label: format(new Date(currentYear, i), 'MMMM', { locale: es }),
}));

const TEST_DELETE_PASSWORD = "eliminarTEST123";
const NL = '\n'; // Newline constant

export default function ShiftGeneratorForm({ allEmployees, allServices }: ShiftGeneratorFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isReevaluating, setIsReevaluating] = useState(false);

  const [generatedResponseText, setGeneratedResponseText] = useState<string | null>(null);
  const [algorithmGeneratedShifts, setAlgorithmGeneratedShifts] = useState<AIShift[] | null>(null);
  const [editableShifts, setEditableShifts] = useState<AIShift[] | null>(null);

  const [generatedScore, setGeneratedScore] = useState<number | null>(null);
  const [generatedViolations, setGeneratedViolations] = useState<ScheduleViolation[] | null>(null);
  const [generatedScoreBreakdown, setGeneratedScoreBreakdown] = useState<ScoreBreakdown | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [displayInfoText, setDisplayInfoText] = useState<string>("Seleccione servicio, mes y año, luego 'Cargar Configuración'.");

  const [currentLoadedPublishedSchedule, setCurrentLoadedPublishedSchedule] = useState<MonthlySchedule | null>(null);
  const [currentLoadedDraftSchedule, setCurrentLoadedDraftSchedule] = useState<MonthlySchedule | null>(null);
  const [previousMonthSchedule, setPreviousMonthSchedule] = useState<MonthlySchedule | null>(null);

  const [showInitialChoiceDialog, setShowInitialChoiceDialog] = useState(false);
  const [userChoiceForExisting, setUserChoiceForExisting] = useState<'modify_published' | 'use_draft' | 'generate_new_draft' | null>(null);

  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const [configLoaded, setConfigLoaded] = useState(false);
  const [loadedConfigValues, setLoadedConfigValues] = useState<ShiftGenerationConfigFormData | null>(null);
  const [currentEditingSource, setCurrentEditingSource] = useState<'none' | 'published' | 'draft' | 'new'>('none');

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [isDeletingSchedules, setIsDeletingSchedules] = useState(false);


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

      let info = `Resumen para generar horario para el servicio: ${watchedSelectedService.name}${NL}`;
      info += `Mes: ${months.find(m => m.value === watchedMonth)?.label || watchedMonth}, Año: ${watchedYear}${NL}${NL}`;
      info += `Reglas del Servicio:${NL}`;
      info += `- Dotación Días de Semana: Mañana=${watchedSelectedService.staffingNeeds.morningWeekday}, Tarde=${watchedSelectedService.staffingNeeds.afternoonWeekday}${watchedSelectedService.enableNightShift ? `, Noche=${watchedSelectedService.staffingNeeds.nightWeekday}` : ''}${NL}`;
      info += `- Dotación Fin de Semana/Feriados: Mañana=${watchedSelectedService.staffingNeeds.morningWeekendHoliday}, Tarde=${watchedSelectedService.staffingNeeds.afternoonWeekendHoliday}${watchedSelectedService.enableNightShift ? `, Noche=${watchedSelectedService.staffingNeeds.nightWeekendHoliday}` : ''}${NL}`;
      info += `- Turno Noche (N) Habilitado: ${watchedSelectedService.enableNightShift ? 'Sí' : 'No'}${NL}`;
      if (watchedSelectedService.consecutivenessRules) {
        info += `- Consecutividad Trabajo: Máx=${watchedSelectedService.consecutivenessRules.maxConsecutiveWorkDays}, Pref=${watchedSelectedService.consecutivenessRules.preferredConsecutiveWorkDays}${NL}`;
        info += `- Consecutividad Descanso: Máx=${watchedSelectedService.consecutivenessRules.maxConsecutiveDaysOff}, Pref=${watchedSelectedService.consecutivenessRules.preferredConsecutiveDaysOff}${NL}`;
        if (watchedSelectedService.consecutivenessRules.minConsecutiveDaysOffRequiredBeforeWork) {
          info += `- Mín. Descansos Antes de Trabajar: ${watchedSelectedService.consecutivenessRules.minConsecutiveDaysOffRequiredBeforeWork}${NL}`;
        }
      }
      if (watchedSelectedService.additionalNotes) {
        info += `- Notas Adicionales del Servicio: ${watchedSelectedService.additionalNotes}${NL}`;
      }
      info += NL;
      const holidaysInMonth = holidays.filter(h => {
        const holidayDate = parseISO(h.date);
        return isValid(holidayDate) && getYearFromDate(holidayDate) === yearInt && getMonthFromDate(holidayDate) === monthIdx;
      });
      if (holidaysInMonth.length > 0) {
        info += `Feriados en ${months.find(m => m.value === watchedMonth)?.label || watchedMonth} ${watchedYear}:${NL}`;
        holidaysInMonth.forEach(h => { info += `  - ${format(parseISO(h.date), 'dd/MM/yyyy')}: ${h.name}${NL}`; });
        info += NL;
      } else { info += `No hay feriados registrados para ${months.find(m => m.value === watchedMonth)?.label || watchedMonth} ${watchedYear}.${NL}${NL}`; }
      const employeesInService = allEmployees.filter(emp => emp.serviceIds.includes(watchedSelectedService.id));
      info += `Empleados Asignados a ${watchedSelectedService.name} (${employeesInService.length}):${NL}`;
      if (employeesInService.length === 0) { info += `- Ninguno${NL}`; } else {
        employeesInService.forEach(emp => {
          info += `${NL}- ${emp.name} (Roles: ${emp.roles.join(', ') || 'N/A'})${NL}`;
          if (emp.preferences) {
            const workPatternLabel = emp.preferences.workPattern === 'mondayToFridayMorning' ? 'L-V Mañana Fijo' : emp.preferences.workPattern === 'mondayToFridayAfternoon' ? 'L-V Tarde Fijo' : 'Rotación Estándar';
            info += `  - Patrón General: ${workPatternLabel}${NL}`;
            info += `  - Prefiere FDS: ${emp.preferences.prefersWeekendWork ? 'Sí' : 'No'}${NL}`;
            info += `  - Elegible D/D: ${emp.preferences.eligibleForDayOffAfterDuty ? 'Sí' : 'No'}${NL}`;
            if ((!emp.preferences.workPattern || emp.preferences.workPattern === 'standardRotation') && emp.preferences.fixedWeeklyShiftDays && emp.preferences.fixedWeeklyShiftDays.length > 0) {
              info += `  - Turno Fijo Semanal: Días=[${emp.preferences.fixedWeeklyShiftDays.join(', ')}], Horario=${emp.preferences.fixedWeeklyShiftTiming || 'No especificado'}${NL}`;
            }
          }
          const relevantAssignments = (emp.fixedAssignments || []).filter(assign => {
            if (!assign.startDate) return false;
            const assignmentStartDate = parseISO(assign.startDate);
            const assignmentEndDate = assign.endDate ? parseISO(assign.endDate) : assignmentStartDate;
            if (!isValid(assignmentStartDate) || (assign.endDate && !isValid(assignmentEndDate))) return false;
            const currentAssignmentInterval = { start: startOfDay(assignmentStartDate), end: endOfDay(assignmentEndDate) };
            return isWithinInterval(monthStart, currentAssignmentInterval) || isWithinInterval(monthEnd, currentAssignmentInterval) || (assignmentStartDate < monthStart && assignmentEndDate > monthEnd);
          });
          if (relevantAssignments.length > 0) {
            info += `  - Asignaciones Fijas en ${months.find(m => m.value === watchedMonth)?.label || watchedMonth}:${NL}`;
            relevantAssignments.forEach(assign => {
              const startDateFormatted = format(parseISO(assign.startDate), 'dd/MM/yyyy');
              const endDateFormatted = assign.endDate && assign.endDate !== assign.startDate ? format(parseISO(assign.endDate), 'dd/MM/yyyy') : startDateFormatted;
              info += `    - ${assign.type}: ${startDateFormatted}${assign.endDate && assign.endDate !== assign.startDate ? ' a ' + endDateFormatted : ''} ${assign.description ? '('+assign.description+')' : ''}${NL}`;
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

  const handleBackToConfig = () => { setShowGrid(false); };

  const resetScheduleState = () => {
    setAlgorithmGeneratedShifts(null); setEditableShifts(null);
    setGeneratedResponseText(null); setGeneratedScore(null);
    setGeneratedViolations(null); setGeneratedScoreBreakdown(null);
    setUserChoiceForExisting(null); setCurrentLoadedPublishedSchedule(null);
    setCurrentLoadedDraftSchedule(null); setPreviousMonthSchedule(null);
    setCurrentEditingSource('none'); setError(null);
    setConfigLoaded(false); setLoadedConfigValues(null);
  };

  const handleLoadConfiguration = async () => {
    const { serviceId, month, year } = form.getValues();
    if (!serviceId || !month || !year) {
      setError("Por favor, seleccione servicio, mes y año.");
      toast({ variant: "destructive", title: "Error", description: "Por favor, seleccione servicio, mes y año." });
      return;
    }
    setIsLoadingConfig(true); setError(null); resetScheduleState();
    try {
      const published = await getPublishedMonthlySchedule(year, month, serviceId);
      const draft = await getDraftMonthlySchedule(year, month, serviceId);
      setCurrentLoadedPublishedSchedule(published); setCurrentLoadedDraftSchedule(draft);
      const currentMonthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const prevMonthDate = subMonths(currentMonthDate, 1);
      const prevMonthYearStr = format(prevMonthDate, 'yyyy');
      const prevMonthMonthStr = format(prevMonthDate, 'M');
      const prevSchedule = await getPublishedMonthlySchedule(prevMonthYearStr, prevMonthMonthStr, serviceId);
      setPreviousMonthSchedule(prevSchedule);
      setConfigLoaded(true); setLoadedConfigValues({serviceId, month, year});
      if (published || draft) { setShowInitialChoiceDialog(true); }
      else { setUserChoiceForExisting('generate_new_draft'); setCurrentEditingSource('new'); setShowInitialChoiceDialog(false); }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "No se pudo cargar la configuración del horario.";
      setError(errorMessage); toast({ variant: "destructive", title: "Error de Carga", description: errorMessage });
      resetScheduleState();
    } finally { setIsLoadingConfig(false); }
  };

  const handleInitialChoice = (choice: 'modify_published' | 'use_draft' | 'generate_new_draft') => {
    setShowInitialChoiceDialog(false); setUserChoiceForExisting(choice);
    setAlgorithmGeneratedShifts(null); setEditableShifts(null);
    setGeneratedResponseText(null); setGeneratedScore(null);
    setGeneratedViolations(null); setGeneratedScoreBreakdown(null);

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
    } else { setCurrentEditingSource('new'); setShowGrid(false); }
  };

  const handleGenerateSubmit = async (data: ShiftGenerationConfigFormData) => {
    if (!watchedSelectedService || isLoadingHolidays || errorHolidays || !configLoaded || !loadedConfigValues) {
      let msg = "No se puede generar: ";
      if (!watchedSelectedService) msg += "Servicio no seleccionado. ";
      if (isLoadingHolidays) msg += "Cargando feriados. ";
      if (errorHolidays) msg += "Error cargando feriados. ";
      if (!configLoaded) msg += "Configuración no cargada. ";
      setError(msg); toast({ variant: "destructive", title: "Error de Generación", description: msg });
      return;
    }
    if (data.serviceId !== loadedConfigValues.serviceId || data.month !== loadedConfigValues.month || data.year !== loadedConfigValues.year) {
        setError("La selección ha cambiado. Recargue la configuración.");
        toast({ variant: "destructive", title: "Selección Cambiada", description: "Recargue la configuración."});
        return;
    }
    setIsGenerating(true); setGeneratedResponseText(null);
    setAlgorithmGeneratedShifts(null); setEditableShifts(null);
    setGeneratedScore(null); setGeneratedViolations(null);
    setGeneratedScoreBreakdown(null); setError(null); setShowGrid(false);
    setCurrentEditingSource('new');
    try {
      const result = await generateAlgorithmicSchedule( watchedSelectedService, data.month, data.year, allEmployees, holidays, previousMonthSchedule?.shifts || null );
      setGeneratedResponseText(result.responseText);
      setGeneratedScore(result.score);
      setGeneratedViolations(result.violations);
      setGeneratedScoreBreakdown(result.scoreBreakdown);

      if (result.generatedShifts && result.generatedShifts.length > 0) {
        setAlgorithmGeneratedShifts(result.generatedShifts);
        setEditableShifts(result.generatedShifts);
      } else {
        setError(result.responseText || "El algoritmo no generó turnos estructurados.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error desconocido en generación algorítmica.";
      setError(message);
    } finally { setIsGenerating(false); }
  };

  const handleReevaluateSchedule = async () => {
    if (!editableShifts || !watchedSelectedService || !loadedConfigValues || isLoadingHolidays || errorHolidays) {
        toast({ variant: "destructive", title: "Error", description: "Faltan datos para re-evaluar (turnos, servicio, config, o feriados)." });
        return;
    }
    setIsReevaluating(true); setError(null);
    try {
        const employeesInService = allEmployees.filter(emp => emp.serviceIds.includes(watchedSelectedService.id));
        const evaluationResult = await evaluateScheduleMetrics(
            editableShifts,
            watchedSelectedService,
            loadedConfigValues.month,
            loadedConfigValues.year,
            employeesInService,
            holidays,
            previousMonthSchedule?.shifts || null
        );
        setGeneratedScore(evaluationResult.score);
        setGeneratedViolations(evaluationResult.violations);
        setGeneratedScoreBreakdown(evaluationResult.scoreBreakdown);
        setGeneratedResponseText(evaluationResult.responseText || "Horario re-evaluado.");
        toast({ title: "Re-evaluación Completa", description: `Nueva puntuación: ${evaluationResult.score.toFixed(0)}/100` });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error desconocido durante la re-evaluación.";
        setError(message);
        toast({ variant: "destructive", title: "Error de Re-evaluación", description: message });
    } finally {
        setIsReevaluating(false);
    }
  };

  const handleConfirmSave = async (action: SaveActionType) => {
    setShowSaveDialog(false);
    if (!editableShifts || !watchedSelectedService || !watchedYear || !watchedMonth || !loadedConfigValues) {
        setError("Faltan datos para guardar."); toast({ variant: "destructive", title: "Error", description: "Faltan datos críticos." });
        return;
    }
    setIsSaving(true); setError(null);
    const schedulePayloadBase = {
        scheduleKey: generateScheduleKey(loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId),
        year: loadedConfigValues.year, month: loadedConfigValues.month, serviceId: loadedConfigValues.serviceId,
        serviceName: watchedSelectedService.name, shifts: editableShifts,
        responseText: generatedResponseText ?? (currentEditingSource === 'draft' && currentLoadedDraftSchedule?.responseText) ?? (currentEditingSource === 'published' && currentLoadedPublishedSchedule?.responseText) ?? "Horario guardado.",
        score: generatedScore ?? (currentEditingSource === 'draft' && currentLoadedDraftSchedule?.score) ?? (currentEditingSource === 'published' && currentLoadedPublishedSchedule?.score) ?? null,
        violations: generatedViolations ?? (currentEditingSource === 'draft' && currentLoadedDraftSchedule?.violations) ?? (currentEditingSource === 'published' && currentLoadedPublishedSchedule?.violations) ?? [],
        scoreBreakdown: generatedScoreBreakdown ?? (currentEditingSource === 'draft' && currentLoadedDraftSchedule?.scoreBreakdown) ?? (currentEditingSource === 'published' && currentLoadedPublishedSchedule?.scoreBreakdown) ?? undefined,
    };
    let savedSchedule: MonthlySchedule | null = null;
    try {
        let draftIdToUseForUpdate: string | undefined = undefined;
        if (action === 'save_draft') {
            if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) { draftIdToUseForUpdate = currentLoadedDraftSchedule.id; }
            else if (currentEditingSource === 'published') { draftIdToUseForUpdate = undefined; }
            savedSchedule = await saveOrUpdateDraftSchedule(schedulePayloadBase, draftIdToUseForUpdate);
            setCurrentLoadedDraftSchedule(savedSchedule); setCurrentEditingSource('draft');
            toast({ title: "Borrador Guardado", description: `Borrador para ${watchedSelectedService.name} - ${months.find(m=>m.value===loadedConfigValues.month)?.label}/${loadedConfigValues.year} guardado.` });
        } else if (action === 'publish_draft') {
            const draftIdToArchive = (currentEditingSource === 'draft' && currentLoadedDraftSchedule) ? currentLoadedDraftSchedule.id : undefined;
            if (!draftIdToArchive) throw new Error("No se puede publicar borrador sin ID válido.");
            savedSchedule = await publishSchedule(schedulePayloadBase, draftIdToArchive);
            setCurrentLoadedPublishedSchedule(savedSchedule); setCurrentLoadedDraftSchedule(null); setCurrentEditingSource('published');
            toast({ title: "Borrador Publicado", description: `El borrador se publicó como activo.` });
        } else if (action === 'publish_new_from_scratch') {
            savedSchedule = await publishSchedule(schedulePayloadBase);
            setCurrentLoadedPublishedSchedule(savedSchedule); setCurrentLoadedDraftSchedule(null); setCurrentEditingSource('published');
            toast({ title: "Horario Publicado", description: `El nuevo horario se publicó como activo.` });
        } else if (action === 'publish_modified_published') {
            if (!currentLoadedPublishedSchedule) throw new Error("No hay horario publicado cargado para modificar.");
            savedSchedule = await publishSchedule(schedulePayloadBase, undefined);
            setCurrentLoadedPublishedSchedule(savedSchedule); setCurrentLoadedDraftSchedule(null); setCurrentEditingSource('published');
            toast({ title: "Horario Publicado Actualizado", description: "Nueva versión publicada." });
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error al guardar."; setError(message);
        toast({ variant: "destructive", title: "Error al Guardar", description: message });
    } finally { setIsSaving(false); }

    if (savedSchedule) {
        if (loadedConfigValues) {
            queryClient.invalidateQueries({ queryKey: ['publishedMonthlySchedule', loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId] });
            queryClient.invalidateQueries({ queryKey: ['draftMonthlySchedule', loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId] });
        }
        handleBackToConfig(); resetScheduleState();
    }
  };


  const handleSaveGeneratedShiftsClick = () => {
    if (!editableShifts || editableShifts.length === 0) {
      setError("No hay turnos para guardar.");
      toast({ variant: "destructive", title: "Error", description: "No hay turnos para guardar." });
      return;
    }
    setShowSaveDialog(true);
  };

  const isFormSelectionChanged = () => {
    if (!loadedConfigValues) return false;
    const currentFormValues = form.getValues();
    return currentFormValues.serviceId !== loadedConfigValues.serviceId || currentFormValues.month !== loadedConfigValues.month || currentFormValues.year !== loadedConfigValues.year;
  };

  const getSaveDialogOptions = () => {
    const options: { label: string; action: () => void; icon: JSX.Element; variant?: "default" | "outline" }[] = [];
    if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) {
        options.push({ label: "Guardar Cambios al Borrador", action: () => handleConfirmSave('save_draft'), icon: <FileText className="mr-2 h-4 w-4" />, variant: "outline" });
        options.push({ label: "Publicar Borrador", action: () => handleConfirmSave('publish_draft'), icon: <UploadCloud className="mr-2 h-4 w-4" /> });
    } else if (currentEditingSource === 'published' && currentLoadedPublishedSchedule) {
        options.push({ label: "Guardar como Nueva Versión Publicada", action: () => handleConfirmSave('publish_modified_published'), icon: <UploadCloud className="mr-2 h-4 w-4" /> });
        options.push({ label: "Guardar Cambios como Borrador Nuevo", action: () => handleConfirmSave('save_draft'), icon: <FileText className="mr-2 h-4 w-4" />, variant: "outline" });
    } else {
        options.push({ label: "Guardar como Borrador", action: () => handleConfirmSave('save_draft'), icon: <FileText className="mr-2 h-4 w-4" />, variant: "outline" });
        options.push({ label: "Guardar y Publicar Directamente", action: () => handleConfirmSave('publish_new_from_scratch'), icon: <UploadCloud className="mr-2 h-4 w-4" /> });
    }
    return options;
  };

  const getInitialChoiceDialogDescription = () => {
    let desc = "Se encontraron horarios existentes: ";
    if (currentLoadedPublishedSchedule) desc += `Un horario PUBLICADO (v${currentLoadedPublishedSchedule.version}, Puntuación: ${currentLoadedPublishedSchedule.score?.toFixed(0) ?? "N/A"}). `;
    if (currentLoadedDraftSchedule) desc += `Un horario BORRADOR (v${currentLoadedDraftSchedule.version}, Puntuación: ${currentLoadedDraftSchedule.score?.toFixed(0) ?? "N/A"}). `;
    desc += "¿Qué desea hacer?";
    return desc;
  };

  const handleDeleteSchedulesRequest = () => {
    if (!configLoaded || !loadedConfigValues) {
      toast({ variant: "destructive", title: "Error", description: "Cargue una configuración para definir qué eliminar." }); return;
    }
    setDeletePassword(''); setDeleteErrorMessage(null); setIsDeleteDialogOpen(true);
  };

  const handleConfirmDeleteSchedules = async () => {
    if (deletePassword !== TEST_DELETE_PASSWORD) { setDeleteErrorMessage("Contraseña incorrecta."); return; }
    if (!loadedConfigValues) { setDeleteErrorMessage("Configuración no cargada."); return; }

    setIsDeletingSchedules(true); setDeleteErrorMessage(null);
    const { serviceId, month, year } = loadedConfigValues;
    const scheduleKey = generateScheduleKey(year, month, serviceId);

    try {
      const count = await dangerouslyDeleteAllSchedulesForKey(scheduleKey);
      toast({ title: "Eliminación Exitosa (Test)", description: `Se eliminaron ${count} horarios para la clave ${scheduleKey}.` });
      queryClient.invalidateQueries({ queryKey: ['publishedMonthlySchedule', year, month, serviceId] });
      queryClient.invalidateQueries({ queryKey: ['draftMonthlySchedule', year, month, serviceId] });
      resetScheduleState(); if (showGrid) { handleBackToConfig(); }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      toast({ variant: "destructive", title: "Error al Eliminar (Test)", description: message });
      setDeleteErrorMessage(message);
    } finally {
        setIsDeletingSchedules(false);
        setIsDeleteDialogOpen(false);
        setDeletePassword('');
    }
  };

  const isActionDisabled = isGenerating || isSaving || isLoadingHolidays || !!errorHolidays || isLoadingConfig || isDeletingSchedules || isReevaluating;
  const canGenerate = configLoaded && (userChoiceForExisting === 'generate_new_draft' || (!currentLoadedPublishedSchedule && !currentLoadedDraftSchedule)) && !isFormSelectionChanged();

  const scoreForEvaluation = showGrid && editableShifts ? (generatedScore) : (algorithmGeneratedShifts ? generatedScore : null);
  const violationsForEvaluation = showGrid && editableShifts ? (generatedViolations) : (algorithmGeneratedShifts ? generatedViolations : null);
  const breakdownForEvaluation = showGrid && editableShifts ? (generatedScoreBreakdown) : (algorithmGeneratedShifts ? generatedScoreBreakdown : null);
  
  return (
    <Card className="w-full">
      {!showGrid ? (
        <>
          <CardHeader>
            <CardTitle className="font-headline flex items-center">
              <Bot className="mr-2 h-6 w-6 text-primary" /> Generador de Horarios
            </CardTitle>
            <CardDescription>
              Seleccione, cargue configuración, y luego genere o modifique horarios.
            </CardDescription>
          </CardHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleGenerateSubmit)}>
                <CardContent className="space-y-6">
                  {errorHolidays && ( <Alert variant="destructive"> <AlertTriangle className="h-4 w-4" /> <AlertTitle>Error Feriados</AlertTitle> <AlertDescription> {errorHolidays.message}. Generación podría ser imprecisa. </AlertDescription> </Alert> )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="serviceId" render={({ field }) => ( <FormItem> <FormLabel>Servicio</FormLabel> <Select onValueChange={(value) => { field.onChange(value); resetScheduleState(); }} value={field.value || ''} disabled={isActionDisabled || showInitialChoiceDialog}> <FormControl><SelectTrigger><SelectValue placeholder="Servicio" /></SelectTrigger></FormControl> <SelectContent>{allServices.map(service => (<SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>))}</SelectContent> </Select><FormMessage /> </FormItem>)} />
                    <FormField control={form.control} name="month" render={({ field }) => ( <FormItem> <FormLabel>Mes</FormLabel> <Select onValueChange={(value) => { field.onChange(value); resetScheduleState(); }} value={field.value} disabled={isActionDisabled || showInitialChoiceDialog}> <FormControl><SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger></FormControl> <SelectContent>{months.map(m => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent> </Select><FormMessage /> </FormItem>)} />
                    <FormField control={form.control} name="year" render={({ field }) => ( <FormItem> <FormLabel>Año</FormLabel> <Select onValueChange={(value) => { field.onChange(value); resetScheduleState(); }} value={field.value} disabled={isActionDisabled || showInitialChoiceDialog}> <FormControl><SelectTrigger><SelectValue placeholder="Año" /></SelectTrigger></FormControl> <SelectContent>{years.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent> </Select><FormMessage /> </FormItem>)} />
                  </div>
                   <Button type="button" onClick={handleLoadConfiguration} disabled={isActionDisabled || showInitialChoiceDialog || isLoadingHolidays} className="w-full md:w-auto"> {isLoadingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />} Cargar Configuración </Button>
                  {configLoaded && (currentLoadedPublishedSchedule || currentLoadedDraftSchedule) && !showInitialChoiceDialog && userChoiceForExisting && (
                    <Alert variant={"default"} className="mt-4 bg-opacity-20"> <Info className="h-4 w-4" /> <AlertTitle> Contexto Actual: { userChoiceForExisting === 'modify_published' && currentLoadedPublishedSchedule ? `Modificando Publicado (v${currentLoadedPublishedSchedule.version})` : userChoiceForExisting === 'use_draft' && currentLoadedDraftSchedule ? `Modificando Borrador (v${currentLoadedDraftSchedule.version})` : userChoiceForExisting === 'generate_new_draft' ? "Listo para Generar Nuevo Borrador" : "Estado Desconocido" } </AlertTitle> <AlertDescription> { userChoiceForExisting === 'modify_published' && currentLoadedPublishedSchedule && `Se cargó el publicado. Puede editarlo. Al guardar, se creará nueva versión o nuevo borrador.`} { userChoiceForExisting === 'use_draft' && currentLoadedDraftSchedule && `Se cargó el borrador. Puede editarlo y guardarlo, o publicarlo.`} { userChoiceForExisting === 'generate_new_draft' && `Haga clic en "Generar Nuevo Borrador".`} </AlertDescription> </Alert>
                  )}
                  { (configLoaded && (userChoiceForExisting === 'generate_new_draft' || (!currentLoadedPublishedSchedule && !currentLoadedDraftSchedule))) && ( <FormItem className="mt-4"> <FormLabel className="flex items-center"><Info className="mr-2 h-4 w-4 text-primary" /> Info para Generación</FormLabel> <Textarea value={isLoadingHolidays ? "Cargando feriados..." : displayInfoText} readOnly rows={10} className="min-h-[150px] font-mono text-xs bg-muted/30 border-dashed" placeholder="Seleccione para ver resumen..." /> </FormItem> )}
                  {(!configLoaded && !showInitialChoiceDialog) && ( <Alert variant="default" className="mt-4"> <Info className="h-4 w-4" /> <AlertTitle>Info Pendiente</AlertTitle> <AlertDescription>{displayInfoText}</AlertDescription> </Alert> )}
                </CardContent>
                <CardFooter className="flex flex-col items-stretch gap-4">
                { canGenerate && !showInitialChoiceDialog && ( <Button type="submit" disabled={isActionDisabled || !watchedServiceId || showInitialChoiceDialog || isFormSelectionChanged()} className="w-full"> {isGenerating ? ( <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando... </> ) : ( <> <CalendarDays className="mr-2 h-4 w-4" /> Generar Nuevo Borrador para {watchedSelectedService?.name || ''} </> )} </Button> )}
                 {generatedResponseText && !showGrid && ( <Card className="mt-4 w-full border-dashed"> <CardHeader className="pb-2 pt-4"><CardTitle className="text-base">Respuesta del Algoritmo/Evaluación</CardTitle></CardHeader> <CardContent> <Textarea value={generatedResponseText} readOnly rows={3} className="min-h-[60px] font-mono text-xs bg-muted/30"/> </CardContent> </Card> )}
                {configLoaded && !showGrid && !showInitialChoiceDialog && ( <Button type="button" variant="destructive" onClick={handleDeleteSchedulesRequest} disabled={isActionDisabled} className="w-full mt-2"> {isDeletingSchedules ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Eliminar Horarios (TEST) </Button> )}
              </form>
            </Form>
        </>
      ) : (
        editableShifts && watchedMonth && watchedYear && loadedConfigValues && (
          <InteractiveScheduleGrid initialShifts={editableShifts} allEmployees={allEmployees} targetService={allServices.find(s => s.id === loadedConfigValues.serviceId)} month={loadedConfigValues.month} year={loadedConfigValues.year} holidays={holidays} onShiftsChange={(updatedShifts) => { setEditableShifts(updatedShifts); }} onBackToConfig={handleBackToConfig} />
        )
      )}

      {((showGrid && editableShifts) || (algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0)) && (
         <ScheduleEvaluationDisplay score={scoreForEvaluation} violations={violationsForEvaluation} scoreBreakdown={breakdownForEvaluation} context="generator" />
      )}

      {error && ( <Alert variant="destructive" className="mt-4 mx-6 mb-6"> <AlertTriangle className="h-4 w-4" /> <AlertTitle>Error</AlertTitle> <AlertDescription>{error}</AlertDescription> </Alert> )}

      {showGrid && editableShifts && configLoaded && loadedConfigValues && (
        <CardFooter className="flex flex-col sm:flex-row items-stretch sm:justify-between gap-4 pt-6">
            <Button onClick={handleReevaluateSchedule} variant="outline" disabled={isActionDisabled || !editableShifts || editableShifts.length === 0} className="w-full sm:w-auto">
                {isReevaluating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
                Re-evaluar Horario
            </Button>
            <Button onClick={handleSaveGeneratedShiftsClick} disabled={isActionDisabled || editableShifts.length === 0} className="w-full sm:w-auto">
                {isSaving ? ( <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando... </> ) : ( <> <Save className="mr-2 h-4 w-4" /> Guardar Horario ({editableShifts.length} turnos) </> )}
            </Button>
        </CardFooter>
      )}
       {!showGrid && algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0 && !isLoadingConfig && configLoaded && (
         <CardFooter className="flex flex-col items-stretch gap-4 pt-0">
            <Button onClick={() => setShowGrid(true)} variant="outline" className="w-full" disabled={isActionDisabled}> <Eye className="mr-2 h-4 w-4" /> Ver y Editar Horario Generado ({algorithmGeneratedShifts.length} turnos) </Button>
         </CardFooter>
      )}

      <AlertDialog open={showInitialChoiceDialog} onOpenChange={(open) => { if (!open && (isActionDisabled)) return; setShowInitialChoiceDialog(open); if(!open && userChoiceForExisting === null) { resetScheduleState(); }}}>
        <AlertDialogContent> <AlertDialogHeader> <AlertDialogTitle>Horario(s) Existente(s)</AlertDialogTitle> <AlertDialogDescription> {getInitialChoiceDialogDescription()} </AlertDialogDescription> </AlertDialogHeader>
          <div className="flex flex-col gap-2 my-4">
            {currentLoadedPublishedSchedule && ( <Button variant="outline" onClick={() => handleInitialChoice('modify_published')} disabled={isActionDisabled} className="w-full justify-start text-left"> <BookMarked className="mr-2 h-4 w-4" /> Modificar Publicado (v{currentLoadedPublishedSchedule.version}) </Button> )}
            {currentLoadedDraftSchedule && ( <Button variant="outline" onClick={() => handleInitialChoice('use_draft')} disabled={isActionDisabled} className="w-full justify-start text-left"> <Edit3 className="mr-2 h-4 w-4" /> Usar Borrador (v{currentLoadedDraftSchedule.version}) </Button> )}
            <Button onClick={() => handleInitialChoice('generate_new_draft')} disabled={isActionDisabled} className="w-full justify-start text-left"> <FilePlus2 className="mr-2 h-4 w-4" /> Generar Nuevo Borrador <span className="text-xs ml-1 text-muted-foreground"> {currentLoadedDraftSchedule ? "(Actual no se modificará hasta guardar)" : ""} {currentLoadedPublishedSchedule && !currentLoadedDraftSchedule ? "(Publicado no se modificará hasta publicar)" : ""} </span> </Button>
          </div>
          <AlertDialogFooter> <AlertDialogCancel onClick={() => {setUserChoiceForExisting(null); resetScheduleState();}} disabled={isActionDisabled} className="w-full">Cancelar Carga</AlertDialogCancel> </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showSaveDialog} onOpenChange={(open) => {if (!open && isSaving) return; setShowSaveDialog(open); }}>
        <AlertDialogContent> <AlertDialogHeader> <AlertDialogTitle>Confirmar Guardado</AlertDialogTitle> <AlertDialogDescription> Guardar horario para {watchedSelectedService?.name} ({loadedConfigValues ? months.find(m=>m.value===loadedConfigValues.month)?.label : watchedMonth}/{loadedConfigValues ? loadedConfigValues.year : watchedYear}). Puntuación: {scoreForEvaluation?.toFixed(0) ?? "N/A"}. </AlertDialogDescription> </AlertDialogHeader>
          <div className="flex flex-col gap-2 my-4"> {getSaveDialogOptions().map(opt => ( <Button key={opt.label} variant={opt.variant || "default"} onClick={opt.action} disabled={isSaving} className="w-full justify-start text-left"> {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : opt.icon} {opt.label} </Button> ))} </div>
          <AlertDialogFooter> <AlertDialogCancel onClick={() => { setShowSaveDialog(false); }} disabled={isSaving}>Cancelar</AlertDialogCancel> </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent> <AlertDialogHeader> <AlertDialogTitle>Eliminar Horarios (Test)</AlertDialogTitle> <AlertDialogDescription> Eliminará PERMANENTEMENTE todos los horarios para <strong> {loadedConfigValues ? allServices.find(s => s.id === loadedConfigValues.serviceId)?.name : ''}</strong> para <strong> {loadedConfigValues ? (months.find(m => m.value === loadedConfigValues.month)?.label + ' ' + loadedConfigValues.year) : ''}</strong>. Ingrese la contraseña de prueba. </AlertDialogDescription> </AlertDialogHeader>
          <div className="space-y-2 py-2"> <Label htmlFor="delete-password">Contraseña de Prueba</Label> <Input id="delete-password" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Ingrese contraseña" disabled={isDeletingSchedules} /> {deleteErrorMessage && ( <p className="text-sm text-destructive">{deleteErrorMessage}</p> )} </div>
          <AlertDialogFooter> <AlertDialogCancel disabled={isDeletingSchedules}>Cancelar</AlertDialogCancel> <AlertDialogAction onClick={handleConfirmDeleteSchedules} disabled={isDeletingSchedules || !deletePassword || deletePassword !== TEST_DELETE_PASSWORD} variant="destructive"> {isDeletingSchedules ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Confirmar </AlertDialogAction> </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
