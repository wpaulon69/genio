
// Unique comment to force re-evaluation: 2024-07-31-AGGRESSIVE-SIMPLIFY-ATTEMPT-7
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
const NL = '\n';

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

  /*
  useEffect(() => {
    if (isLoadingHolidays) {
      setDisplayInfoText('Cargando feriados...');
    } else if (errorHolidays) {
      setDisplayInfoText('Error al cargar feriados. La generación podría ser imprecisa.');
    } else if (configLoaded && loadedConfigValues && watchedSelectedService) {
      // Construct detailed info string
      let info = `Configuración Cargada para ${watchedSelectedService.name} (${months.find(m => m.value === loadedConfigValues.month)?.label || loadedConfigValues.month}/${loadedConfigValues.year}).${NL}`;
      info += `Publicado: ${currentLoadedPublishedSchedule ? `v${currentLoadedPublishedSchedule.version}` : 'No'}. `;
      info += `Borrador: ${currentLoadedDraftSchedule ? `v${currentLoadedDraftSchedule.version}` : 'No'}. `;
      info += `Continuidad Mes Anterior: ${previousMonthSchedule ? `Sí (v${previousMonthSchedule.version})` : 'No'}. `;
      info += `Feriados: ${holidays.length} cargados.${NL}`;
      
      let choiceInfo = "Acción Pendiente: ";
      if (userChoiceForExisting === 'modify_published') choiceInfo = "Acción Actual: Modificar Publicado.";
      else if (userChoiceForExisting === 'use_draft') choiceInfo = "Acción Actual: Usar Borrador.";
      else if (userChoiceForExisting === 'generate_new_draft') choiceInfo = "Acción Actual: Generar Nuevo Borrador.";
      else if (showInitialChoiceDialog) choiceInfo = "Esperando selección para horarios existentes...";
      info += choiceInfo;
      
      setDisplayInfoText(info);
    } else if (watchedSelectedService && watchedMonth && watchedYear) {
      setDisplayInfoText(`Configuración para: ${watchedSelectedService.name} - ${months.find(m => m.value === watchedMonth)?.label || watchedMonth}/${watchedYear}. Presione 'Cargar Configuración'.`);
    } else {
      setDisplayInfoText('Seleccione servicio, mes y año, luego presione "Cargar Configuración".');
    }
  }, [
    configLoaded,
    loadedConfigValues,
    watchedSelectedService,
    watchedMonth,
    watchedYear,
    isLoadingHolidays,
    errorHolidays,
    holidays,
    currentLoadedPublishedSchedule,
    currentLoadedDraftSchedule,
    previousMonthSchedule,
    userChoiceForExisting,
    showInitialChoiceDialog,
    NL
  ]);
  */


  const handleBackToConfig = () => { setShowGrid(false); };

  const resetScheduleState = () => {
    setAlgorithmGeneratedShifts(null);
    setEditableShifts(null);
    setGeneratedResponseText(null);
    setGeneratedScore(null);
    setGeneratedViolations(null);
    setGeneratedScoreBreakdown(null);
    setUserChoiceForExisting(null);
    setCurrentLoadedPublishedSchedule(null);
    setCurrentLoadedDraftSchedule(null);
    setPreviousMonthSchedule(null);
    setCurrentEditingSource('none');
    setError(null);
    setConfigLoaded(false);
    setLoadedConfigValues(null);
  };

  const handleLoadConfiguration = async () => {
    const { serviceId, month, year } = form.getValues();
    if (!serviceId || !month || !year) {
      setError("Por favor, seleccione servicio, mes y año.");
      toast({ variant: "destructive", title: "Error", description: "Por favor, seleccione servicio, mes y año." });
      return;
    }
    setIsLoadingConfig(true);
    setError(null);
    resetScheduleState(); // Reset state before loading new config
    try {
      const published = await getPublishedMonthlySchedule(year, month, serviceId);
      const draft = await getDraftMonthlySchedule(year, month, serviceId);
      setCurrentLoadedPublishedSchedule(published);
      setCurrentLoadedDraftSchedule(draft);

      // Fetch previous month's schedule for continuity
      const currentMonthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const prevMonthDate = subMonths(currentMonthDate, 1);
      const prevMonthYearStr = format(prevMonthDate, 'yyyy');
      const prevMonthMonthStr = format(prevMonthDate, 'M'); // 'M' for month without leading zero
      const prevSchedule = await getPublishedMonthlySchedule(prevMonthYearStr, prevMonthMonthStr, serviceId);
      setPreviousMonthSchedule(prevSchedule);

      setConfigLoaded(true);
      setLoadedConfigValues({serviceId, month, year}); // Store the successfully loaded config

      if (published || draft) {
        setShowInitialChoiceDialog(true);
      } else {
        // No existing published or draft, proceed to allow new generation
        setUserChoiceForExisting('generate_new_draft');
        setCurrentEditingSource('new');
        setShowInitialChoiceDialog(false); // Don't show dialog if nothing exists
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "No se pudo cargar la configuración del horario.";
      setError(errorMessage);
      toast({ variant: "destructive", title: "Error de Carga", description: errorMessage });
      resetScheduleState(); // Reset on error
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleInitialChoice = (choice: 'modify_published' | 'use_draft' | 'generate_new_draft') => {
    setShowInitialChoiceDialog(false);
    setUserChoiceForExisting(choice);

    // Reset generated/editable state specific to a new choice
    setAlgorithmGeneratedShifts(null);
    setEditableShifts(null);
    setGeneratedResponseText(null);
    setGeneratedScore(null);
    setGeneratedViolations(null);
    setGeneratedScoreBreakdown(null);

    if (choice === 'modify_published' && currentLoadedPublishedSchedule) {
        setCurrentEditingSource('published');
        setEditableShifts(currentLoadedPublishedSchedule.shifts ? [...currentLoadedPublishedSchedule.shifts] : []);
        setGeneratedResponseText(currentLoadedPublishedSchedule.responseText || ""); // Keep response text from published
        setGeneratedScore(currentLoadedPublishedSchedule.score ?? null);
        setGeneratedViolations(currentLoadedPublishedSchedule.violations ?? null);
        setGeneratedScoreBreakdown(currentLoadedPublishedSchedule.scoreBreakdown ?? null);
        setShowGrid(true);
    } else if (choice === 'use_draft' && currentLoadedDraftSchedule) {
        setCurrentEditingSource('draft');
        setEditableShifts(currentLoadedDraftSchedule.shifts ? [...currentLoadedDraftSchedule.shifts] : []);
        setGeneratedResponseText(currentLoadedDraftSchedule.responseText || ""); // Keep response text from draft
        setGeneratedScore(currentLoadedDraftSchedule.score ?? null);
        setGeneratedViolations(currentLoadedDraftSchedule.violations ?? null);
        setGeneratedScoreBreakdown(currentLoadedDraftSchedule.scoreBreakdown ?? null);
        setShowGrid(true);
    } else { // generate_new_draft
      setCurrentEditingSource('new');
      // Don't show grid yet, wait for user to click "Generate"
      setShowGrid(false);
    }
  };

  const handleGenerateSubmit = async (data: ShiftGenerationConfigFormData) => {
    if (!watchedSelectedService || isLoadingHolidays || errorHolidays || !configLoaded || !loadedConfigValues) {
      let msg = "No se puede generar: ";
      if (!watchedSelectedService) msg += "Servicio no seleccionado. ";
      if (isLoadingHolidays) msg += "Cargando feriados. ";
      if (errorHolidays) msg += "Error cargando feriados. ";
      if (!configLoaded) msg += "Configuración no cargada. ";
      setError(msg);
      toast({ variant: "destructive", title: "Error de Generación", description: msg });
      return;
    }

    // Ensure generation uses the loaded configuration
    if (data.serviceId !== loadedConfigValues.serviceId || data.month !== loadedConfigValues.month || data.year !== loadedConfigValues.year) {
        setError("La selección del formulario ha cambiado desde que se cargó la configuración. Por favor, recargue la configuración con los nuevos valores antes de generar.");
        toast({ variant: "destructive", title: "Selección Cambiada", description: "La selección del formulario no coincide con la configuración cargada. Recargue la configuración."});
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
    setShowGrid(false); // Hide grid while generating
    setCurrentEditingSource('new'); // Generating a new schedule

    try {
      // Use loadedConfigValues for generation
      const result = await generateAlgorithmicSchedule(
        watchedSelectedService,
        loadedConfigValues.month,
        loadedConfigValues.year,
        allEmployees,
        holidays,
        previousMonthSchedule?.shifts || null // Pass previous month's shifts
      );

      setGeneratedResponseText(result.responseText);
      setGeneratedScore(result.score);
      setGeneratedViolations(result.violations);
      setGeneratedScoreBreakdown(result.scoreBreakdown);

      if (result.generatedShifts && result.generatedShifts.length > 0) {
        setAlgorithmGeneratedShifts(result.generatedShifts);
        setEditableShifts(result.generatedShifts); // Set for potential immediate editing
      } else {
        setError(result.responseText || "El algoritmo no generó turnos estructurados.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error desconocido en generación algorítmica.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReevaluateSchedule = async () => {
    if (!editableShifts || !watchedSelectedService || !loadedConfigValues || isLoadingHolidays || errorHolidays) {
        toast({ variant: "destructive", title: "Error", description: "Faltan datos para re-evaluar (turnos, servicio, config, o feriados)." });
        return;
    }
    setIsReevaluating(true);
    setError(null);
    try {
        // Ensure we use employees relevant to the *loaded* service for evaluation
        const employeesInService = allEmployees.filter(emp => emp.serviceIds.includes(loadedConfigValues.serviceId));

        const evaluationResult = await evaluateScheduleMetrics(
            editableShifts,
            watchedSelectedService, // This should be the service matching loadedConfigValues.serviceId
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
        setError("Faltan datos para guardar. Asegúrese de que la configuración esté cargada y haya turnos para guardar.");
        toast({ variant: "destructive", title: "Error al Guardar", description: "Faltan datos críticos (configuración o turnos)." });
        return;
    }

    setIsSaving(true);
    setError(null);

    // Determine the source of truth for score, violations, breakdown based on current editing source
    let scoreToSave = generatedScore;
    let violationsToSave = generatedViolations;
    let breakdownToSave = generatedScoreBreakdown;
    let responseTextToSave = generatedResponseText;

    if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) {
        // If editing a draft and new values are null/undefined, use existing draft values
        scoreToSave = generatedScore ?? currentLoadedDraftSchedule.score ?? null;
        violationsToSave = generatedViolations ?? currentLoadedDraftSchedule.violations ?? [];
        breakdownToSave = generatedScoreBreakdown ?? currentLoadedDraftSchedule.scoreBreakdown ?? undefined;
        responseTextToSave = generatedResponseText ?? currentLoadedDraftSchedule.responseText ?? "Borrador guardado.";
    } else if (currentEditingSource === 'published' && currentLoadedPublishedSchedule) {
        // If editing a published schedule (to save as draft or new published)
        scoreToSave = generatedScore ?? currentLoadedPublishedSchedule.score ?? null;
        violationsToSave = generatedViolations ?? currentLoadedPublishedSchedule.violations ?? [];
        breakdownToSave = generatedScoreBreakdown ?? currentLoadedPublishedSchedule.scoreBreakdown ?? undefined;
        responseTextToSave = generatedResponseText ?? currentLoadedPublishedSchedule.responseText ?? "Horario modificado guardado.";
    } else { // 'new' or no specific source, use current generated values
        scoreToSave = generatedScore ?? null;
        violationsToSave = generatedViolations ?? [];
        breakdownToSave = generatedScoreBreakdown ?? undefined;
        responseTextToSave = generatedResponseText ?? "Horario guardado.";
    }


    const schedulePayloadBase = {
        scheduleKey: generateScheduleKey(loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId),
        year: loadedConfigValues.year,
        month: loadedConfigValues.month,
        serviceId: loadedConfigValues.serviceId,
        serviceName: watchedSelectedService.name, // Should match service from loadedConfigValues
        shifts: editableShifts,
        responseText: responseTextToSave,
        score: scoreToSave,
        violations: violationsToSave,
        scoreBreakdown: breakdownToSave,
    };

    let savedSchedule: MonthlySchedule | null = null;

    try {
        let draftIdToUseForUpdate: string | undefined = undefined;
        
        if (action === 'save_draft') {
            // If currently editing a draft, use its ID to update.
            // If modifying a published schedule and saving as a new draft, draftIdToUseForUpdate should be undefined.
            if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) {
              draftIdToUseForUpdate = currentLoadedDraftSchedule.id;
            } else if (currentEditingSource === 'published') { // Modifying published, saving as NEW draft
              draftIdToUseForUpdate = undefined; 
            }
            // If currentEditingSource is 'new', draftIdToUseForUpdate will be undefined (correct for new draft).

            savedSchedule = await saveOrUpdateDraftSchedule(schedulePayloadBase, draftIdToUseForUpdate);
            setCurrentLoadedDraftSchedule(savedSchedule); // Update local state with the saved draft
            setCurrentEditingSource('draft'); // Now editing this draft
            toast({ title: "Borrador Guardado", description: `Borrador para ${watchedSelectedService.name} - ${months.find(m=>m.value===loadedConfigValues.month)?.label}/${loadedConfigValues.year} guardado.` });
        } else if (action === 'publish_draft') {
            // This action assumes we are publishing an existing draft.
            const draftIdToArchive = (currentEditingSource === 'draft' && currentLoadedDraftSchedule) ? currentLoadedDraftSchedule.id : undefined;
            if (!draftIdToArchive) throw new Error("No se puede publicar un borrador sin un ID de borrador válido. Asegúrese de que está editando un borrador existente.");
            
            savedSchedule = await publishSchedule(schedulePayloadBase, draftIdToArchive);
            setCurrentLoadedPublishedSchedule(savedSchedule); // Update local state with published
            setCurrentLoadedDraftSchedule(null); // Clear draft
            setCurrentEditingSource('published'); // Now viewing/editing the published version
            toast({ title: "Borrador Publicado", description: `El borrador se publicó como activo.` });
        } else if (action === 'publish_new_from_scratch') {
            // This action is for when there was no draft, or we are generating new and publishing directly.
            // No draft ID to archive specifically. publishSchedule handles archiving any existing published.
            savedSchedule = await publishSchedule(schedulePayloadBase);
            setCurrentLoadedPublishedSchedule(savedSchedule);
            setCurrentLoadedDraftSchedule(null);
            setCurrentEditingSource('published');
            toast({ title: "Horario Publicado", description: `El nuevo horario se publicó como activo.` });
        } else if (action === 'publish_modified_published') {
             // This action is for when we were editing a published schedule and want to save it as a new published version.
            if (!currentLoadedPublishedSchedule) throw new Error("No hay horario publicado cargado para modificar y republicar.");
            // The old published schedule (currentLoadedPublishedSchedule.id) will be archived by publishSchedule.
            savedSchedule = await publishSchedule(schedulePayloadBase, undefined); // undefined for draftIdToArchive
            setCurrentLoadedPublishedSchedule(savedSchedule);
            setCurrentLoadedDraftSchedule(null); // No draft involved here
            setCurrentEditingSource('published');
            toast({ title: "Horario Publicado Actualizado", description: "La nueva versión del horario ha sido publicada." });
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error al guardar.";
        setError(message);
        toast({ variant: "destructive", title: "Error al Guardar", description: message });
    } finally {
      setIsSaving(false);
    }

    if (savedSchedule) {
        // Invalidate queries to refetch data for other parts of the app
        if (loadedConfigValues) {
            queryClient.invalidateQueries({ queryKey: ['publishedMonthlySchedule', loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId] });
            queryClient.invalidateQueries({ queryKey: ['draftMonthlySchedule', loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId] });
        }
        // Reset the form/generator state to avoid stale data issues
        handleBackToConfig(); // Go back to config view
        resetScheduleState();   // Fully reset the generator state
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
    if (!loadedConfigValues) return false; // If no config loaded, any selection is effectively a "change" until loaded
    const currentFormValues = form.getValues();
    return currentFormValues.serviceId !== loadedConfigValues.serviceId ||
           currentFormValues.month !== loadedConfigValues.month ||
           currentFormValues.year !== loadedConfigValues.year;
  };


  const getSaveDialogOptions = () => {
    // Super simplified to ensure no syntax error here
    const options: { label: string; action: () => void; icon: JSX.Element; variant?: "default" | "outline" }[] = [];
    if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) {
        options.push({ label: "Guardar Borrador", action: () => handleConfirmSave('save_draft'), icon: <FileText className="mr-2 h-4 w-4" />, variant: "outline" });
        options.push({ label: "Publicar Borrador", action: () => handleConfirmSave('publish_draft'), icon: <UploadCloud className="mr-2 h-4 w-4" /> });
    } else if (currentEditingSource === 'published' && currentLoadedPublishedSchedule) {
        options.push({ label: "Publicar como Nueva Versión", action: () => handleConfirmSave('publish_modified_published'), icon: <UploadCloud className="mr-2 h-4 w-4" /> });
        options.push({ label: "Guardar Cambios como Borrador", action: () => handleConfirmSave('save_draft'), icon: <FileText className="mr-2 h-4 w-4" />, variant: "outline" });
    } else { // 'new' source or no loaded draft/published
        options.push({ label: "Guardar como Borrador", action: () => handleConfirmSave('save_draft'), icon: <FileText className="mr-2 h-4 w-4" />, variant: "outline" });
        options.push({ label: "Guardar y Publicar", action: () => handleConfirmSave('publish_new_from_scratch'), icon: <UploadCloud className="mr-2 h-4 w-4" /> });
    }
    return options;
  };

  const getInitialChoiceDialogDescription = () => {
    // Super simplified
    let desc = "Horarios existentes encontrados. ";
    if (currentLoadedPublishedSchedule) desc += "Hay uno PUBLICADO. ";
    if (currentLoadedDraftSchedule) desc += "Hay un BORRADOR. ";
    desc += "¿Qué hacer?";
    return desc;
  };

  const handleDeleteSchedulesRequest = () => {
    if (!configLoaded || !loadedConfigValues) {
      toast({ variant: "destructive", title: "Error", description: "Cargue una configuración para definir qué eliminar." }); return;
    }
    setDeletePassword('');
    setDeleteErrorMessage(null);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDeleteSchedules = async () => {
    if (deletePassword !== TEST_DELETE_PASSWORD) {
      setDeleteErrorMessage("Contraseña incorrecta.");
      return;
    }
    if (!loadedConfigValues) {
      setDeleteErrorMessage("Configuración no cargada.");
      return;
    }

    setIsDeletingSchedules(true);
    setDeleteErrorMessage(null);
    const { serviceId, month, year } = loadedConfigValues;
    const scheduleKey = generateScheduleKey(year, month, serviceId);

    try {
      const count = await dangerouslyDeleteAllSchedulesForKey(scheduleKey);
      toast({ title: "Eliminación Exitosa (Test)", description: `Se eliminaron ${count} horarios para la clave ${scheduleKey}.` });
      queryClient.invalidateQueries({ queryKey: ['publishedMonthlySchedule', year, month, serviceId] });
      queryClient.invalidateQueries({ queryKey: ['draftMonthlySchedule', year, month, serviceId] });
      resetScheduleState(); // Reset state
      if (showGrid) {
        handleBackToConfig(); // Go back to config view if grid was shown
      }
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
  
  let scoreToDisplayInEval: number | null | undefined = null;
  let violationsToDisplayInEval: ScheduleViolation[] | null | undefined = null;
  let breakdownToDisplayInEval: ScoreBreakdown | null | undefined = null;

  if (showGrid && editableShifts) { // If actively editing in grid
    scoreToDisplayInEval = generatedScore; // Use latest generated/reevaluated score
    violationsToDisplayInEval = generatedViolations;
    breakdownToDisplayInEval = generatedScoreBreakdown;
  } else if (algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0) { // If just generated, not yet in grid
    scoreToDisplayInEval = generatedScore;
    violationsToDisplayInEval = generatedViolations;
    breakdownToDisplayInEval = generatedScoreBreakdown;
  } else if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) { // Loaded a draft
    scoreToDisplayInEval = currentLoadedDraftSchedule.score;
    violationsToDisplayInEval = currentLoadedDraftSchedule.violations;
    breakdownToDisplayInEval = currentLoadedDraftSchedule.scoreBreakdown;
  } else if (currentEditingSource === 'published' && currentLoadedPublishedSchedule) { // Loaded a published schedule
    scoreToDisplayInEval = currentLoadedPublishedSchedule.score;
    violationsToDisplayInEval = currentLoadedPublishedSchedule.violations;
    breakdownToDisplayInEval = currentLoadedPublishedSchedule.scoreBreakdown;
  }
  
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
                  {errorHolidays && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Error Feriados</AlertTitle>
                      <AlertDescription>
                        {(errorHolidays as Error).message}. Generación podría ser imprecisa.
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="serviceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Servicio</FormLabel>
                          <Select
                            onValueChange={(value) => { field.onChange(value); resetScheduleState(); }}
                            value={field.value || ''}
                            disabled={isActionDisabled || showInitialChoiceDialog}
                          >
                            <FormControl><SelectTrigger><SelectValue placeholder="Servicio" /></SelectTrigger></FormControl>
                            <SelectContent>{allServices.map(service => (<SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>))}</SelectContent>
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
                          <Select
                            onValueChange={(value) => { field.onChange(value); resetScheduleState(); }}
                            value={field.value}
                            disabled={isActionDisabled || showInitialChoiceDialog}
                          >
                            <FormControl><SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger></FormControl>
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
                          <Select
                            onValueChange={(value) => { field.onChange(value); resetScheduleState(); }}
                            value={field.value}
                            disabled={isActionDisabled || showInitialChoiceDialog}
                          >
                            <FormControl><SelectTrigger><SelectValue placeholder="Año" /></SelectTrigger></FormControl>
                            <SelectContent>{years.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {/* Load Configuration Button */}
                  <Button
                    type="button"
                    onClick={handleLoadConfiguration}
                    disabled={isActionDisabled || showInitialChoiceDialog || isLoadingHolidays}
                    className="w-full md:w-auto"
                  >
                    {isLoadingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                    Cargar Configuración
                  </Button>

                  {/* Info Alert: Shows context after config load and choice */}
                  {configLoaded && (currentLoadedPublishedSchedule || currentLoadedDraftSchedule) && !showInitialChoiceDialog && userChoiceForExisting && (
                    <Alert variant={"default"} className="mt-4 bg-opacity-20">
                      <Info className="h-4 w-4" />
                      <AlertTitle>
                        Contexto Actual:
                        {
                          userChoiceForExisting === 'modify_published' && currentLoadedPublishedSchedule ? ` Modificando Publicado (v${currentLoadedPublishedSchedule.version})` :
                          userChoiceForExisting === 'use_draft' && currentLoadedDraftSchedule ? ` Modificando Borrador (v${currentLoadedDraftSchedule.version})` :
                          userChoiceForExisting === 'generate_new_draft' ? " Listo para Generar Nuevo Borrador" :
                          " Estado Desconocido"
                        }
                      </AlertTitle>
                      <AlertDescription>
                        { userChoiceForExisting === 'modify_published' && currentLoadedPublishedSchedule && `Se cargó el horario publicado. Puede editarlo en la grilla. Al guardar, se creará una nueva versión publicada o un nuevo borrador.`}
                        { userChoiceForExisting === 'use_draft' && currentLoadedDraftSchedule && `Se cargó el borrador existente. Puede editarlo en la grilla y guardarlo, o publicarlo.`}
                        { userChoiceForExisting === 'generate_new_draft' && `Haga clic en "Generar Nuevo Borrador" para crear un horario con el algoritmo.`}
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {/* Display Info Text Area */}
                  { (configLoaded && (userChoiceForExisting === 'generate_new_draft' || (!currentLoadedPublishedSchedule && !currentLoadedDraftSchedule))) && (
                    <FormItem className="mt-4">
                      <FormLabel className="flex items-center"><Info className="mr-2 h-4 w-4 text-primary" /> Info para Generación</FormLabel>
                      <Textarea
                        value={isLoadingHolidays ? "Cargando feriados..." : displayInfoText}
                        readOnly
                        rows={10}
                        className="min-h-[150px] font-mono text-xs bg-muted/30 border-dashed"
                        placeholder="Seleccione servicio, mes y año, y cargue configuración para ver el resumen detallado aquí..."
                      />
                    </FormItem>
                  )}
                  {/* Initial state before config load */}
                  {(!configLoaded && !showInitialChoiceDialog) && (
                     <Alert variant="default" className="mt-4">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Info Pendiente</AlertTitle>
                        <AlertDescription>{displayInfoText}</AlertDescription>
                     </Alert>
                  )}

                </CardContent>
                <CardFooter className="flex flex-col items-stretch gap-4">
                {/* Generate New Draft Button */}
                { canGenerate && !showInitialChoiceDialog && (
                  <Button
                    type="submit" // This button submits the form, triggering handleGenerateSubmit
                    disabled={isActionDisabled || !watchedServiceId || showInitialChoiceDialog || isFormSelectionChanged()}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando... </>
                    ) : (
                      <> <CalendarDays className="mr-2 h-4 w-4" /> Generar Nuevo Borrador para {watchedSelectedService?.name || ''} </>
                    )}
                  </Button>
                )}

                {/* Display algorithm response if available and grid is not shown */}
                {generatedResponseText && !showGrid && (
                  <Card className="mt-4 w-full border-dashed">
                    <CardHeader className="pb-2 pt-4"><CardTitle className="text-base">Respuesta del Algoritmo/Evaluación</CardTitle></CardHeader>
                    <CardContent>
                      <Textarea value={generatedResponseText} readOnly rows={3} className="min-h-[60px] font-mono text-xs bg-muted/30"/>
                    </CardContent>
                  </Card>
                )}

                {/* Delete Schedules Button (Test Only) */}
                {configLoaded && !showGrid && !showInitialChoiceDialog && (
                    <Button type="button" variant="destructive" onClick={handleDeleteSchedulesRequest} disabled={isActionDisabled} className="w-full mt-2">
                        {isDeletingSchedules ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Eliminar Horarios (TEST)
                    </Button>
                )}

              </form>
            </Form>
        </>
      ) : (
        // Show Grid View
        editableShifts && watchedMonth && watchedYear && loadedConfigValues && (
          <InteractiveScheduleGrid
            initialShifts={editableShifts}
            allEmployees={allEmployees}
            targetService={allServices.find(s => s.id === loadedConfigValues.serviceId)} // Use loaded serviceId
            month={loadedConfigValues.month}
            year={loadedConfigValues.year}
            holidays={holidays}
            onShiftsChange={(updatedShifts) => {
              setEditableShifts(updatedShifts);
              // Clear previous evaluation when shifts change, prompt for re-evaluation
              setGeneratedScore(null);
              setGeneratedViolations(null);
              setGeneratedScoreBreakdown(null);
              setGeneratedResponseText("Horario modificado. Re-evalúe para actualizar la puntuación y violaciones.");
            }}
            onBackToConfig={handleBackToConfig}
          />
        )
      )}

      {/* Schedule Evaluation Display - shown if grid is active OR if algorithm just ran and produced shifts */}
      {((showGrid && editableShifts) || (algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0)) && (
         <ScheduleEvaluationDisplay
            score={scoreToDisplayInEval}
            violations={violationsToDisplayInEval}
            scoreBreakdown={breakdownToDisplayInEval}
            context="generator"
         />
      )}

      {/* General Error Display */}
      {error && (
        <Alert variant="destructive" className="mt-4 mx-6 mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Footer buttons for Grid view (Save, Re-evaluate) */}
      {showGrid && editableShifts && configLoaded && loadedConfigValues && (
        <CardFooter className="flex flex-col sm:flex-row items-stretch sm:justify-between gap-4 pt-6">
            <Button
                onClick={handleReevaluateSchedule}
                variant="outline"
                disabled={isActionDisabled || !editableShifts || editableShifts.length === 0}
                className="w-full sm:w-auto"
            >
                {isReevaluating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
                Re-evaluar Horario
            </Button>
            <Button
                onClick={handleSaveGeneratedShiftsClick}
                disabled={isActionDisabled || editableShifts.length === 0}
                className="w-full sm:w-auto"
            >
                {isSaving ? (
                <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando... </>
                ) : (
                <> <Save className="mr-2 h-4 w-4" /> Guardar Horario ({editableShifts.length} turnos) </>
                )}
            </Button>
        </CardFooter>
      )}
      {/* Footer button for initial algorithm output (View/Edit) */}
       {!showGrid && algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0 && !isLoadingConfig && configLoaded && (
         <CardFooter className="flex flex-col items-stretch gap-4 pt-0">
            <Button onClick={() => setShowGrid(true)} variant="outline" className="w-full" disabled={isActionDisabled}>
              <Eye className="mr-2 h-4 w-4" /> Ver y Editar Horario Generado ({algorithmGeneratedShifts.length} turnos)
            </Button>
         </CardFooter>
       )}

      {/* Dialog for initial choice when existing schedules are found */}
      <AlertDialog open={showInitialChoiceDialog} onOpenChange={(open) => {
          if (!open && (isActionDisabled)) return; // Prevent closing if actions are disabled (e.g. during load)
          setShowInitialChoiceDialog(open);
          if(!open && userChoiceForExisting === null) { // If dialog closed without making a choice
            resetScheduleState(); // Reset everything
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Horario(s) Existente(s)</AlertDialogTitle>
            <AlertDialogDescription>
              {getInitialChoiceDialogDescription()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 my-4">
            {currentLoadedPublishedSchedule && (
              <Button variant="outline" onClick={() => handleInitialChoice('modify_published')} disabled={isActionDisabled} className="w-full justify-start text-left">
                <BookMarked className="mr-2 h-4 w-4" />
                Modificar Publicado (v{currentLoadedPublishedSchedule.version})
              </Button>
            )}
            {currentLoadedDraftSchedule && (
              <Button variant="outline" onClick={() => handleInitialChoice('use_draft')} disabled={isActionDisabled} className="w-full justify-start text-left">
                <Edit3 className="mr-2 h-4 w-4" />
                Usar Borrador (v{currentLoadedDraftSchedule.version})
              </Button>
            )}
            <Button onClick={() => handleInitialChoice('generate_new_draft')} disabled={isActionDisabled} className="w-full justify-start text-left">
              <FilePlus2 className="mr-2 h-4 w-4" />
              Generar Nuevo Borrador
              <span className="text-xs ml-1 text-muted-foreground">
                {currentLoadedDraftSchedule ? "(Actual no se modificará hasta guardar)" : ""}
                {currentLoadedPublishedSchedule && !currentLoadedDraftSchedule ? "(Publicado no se modificará hasta publicar)" : ""}
              </span>
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setUserChoiceForExisting(null); resetScheduleState();}} disabled={isActionDisabled} className="w-full">Cancelar Carga</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog for save confirmation */}
      <AlertDialog open={showSaveDialog} onOpenChange={(open) => {
          if (!open && isSaving) return; // Prevent closing if saving
          setShowSaveDialog(open);
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Guardado</AlertDialogTitle>
            <AlertDialogDescription>
              Guardar horario para {watchedSelectedService?.name} ({loadedConfigValues ? months.find(m=>m.value===loadedConfigValues.month)?.label : watchedMonth}/{loadedConfigValues ? loadedConfigValues.year : watchedYear}).
              Puntuación: {scoreToDisplayInEval?.toFixed(0) ?? "N/A"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 my-4">
            {getSaveDialogOptions().map(opt => (
              <Button key={opt.label} variant={opt.variant || "default"} onClick={opt.action} disabled={isSaving} className="w-full justify-start text-left">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : opt.icon}
                {opt.label}
              </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowSaveDialog(false); }} disabled={isSaving}>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
       {/* Dialog for deleting schedules (TEST ONLY) */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Eliminar Horarios (Test)</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción eliminará PERMANENTEMENTE todos los horarios (borradores, publicados, archivados) para 
                    <strong> {loadedConfigValues ? allServices.find(s => s.id === loadedConfigValues.serviceId)?.name : ''}</strong> para 
                    <strong> {loadedConfigValues ? (months.find(m => m.value === loadedConfigValues.month)?.label + ' ' + loadedConfigValues.year) : ''}</strong>.
                    Ingrese la contraseña de prueba para confirmar.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-2">
                <Label htmlFor="delete-password">Contraseña de Prueba</Label>
                <Input
                    id="delete-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Ingrese contraseña"
                    disabled={isDeletingSchedules}
                />
                {deleteErrorMessage && (
                    <p className="text-sm text-destructive">{deleteErrorMessage}</p>
                )}
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingSchedules}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                    onClick={handleConfirmDeleteSchedules}
                    disabled={isDeletingSchedules || !deletePassword || deletePassword !== TEST_DELETE_PASSWORD}
                    variant="destructive"
                >
                    {isDeletingSchedules ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Confirmar Eliminación
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </Card>
  );
}
// End of file, ensure newline for parsing.

