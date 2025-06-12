
// Unique comment for final re-evaluation check: 2024-08-01-SIMPLIFY-MORE-JSX-TEST-FINAL
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

export default function ShiftGeneratorForm({ allEmployees, allServices }: ShiftGeneratorFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const NL = '\n';

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
  const [displayInfoText, setDisplayInfoText] = useState<string>("Información simplificada. Cargue configuración.");


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
    if (isLoadingHolidays) {
      setDisplayInfoText('Cargando feriados...');
      return;
    }
    if (errorHolidays && errorHolidays instanceof Error) {
      setDisplayInfoText('Error cargando feriados. Detalles en consola.');
      console.error("Error cargando feriados:", errorHolidays.message);
      return;
    }

    if (configLoaded && loadedConfigValues && watchedSelectedService) {
        let info = 'Config cargada: ' + watchedSelectedService.name + ' (' + (months.find(m => m.value === loadedConfigValues.month)?.label || loadedConfigValues.month) + '/' + loadedConfigValues.year + ').' + NL;
        info += 'Publicado: ' + (currentLoadedPublishedSchedule ? 'Sí' : 'No') + '. ';
        info += 'Borrador: ' + (currentLoadedDraftSchedule ? 'Sí' : 'No') + '.' + NL;

        if (showInitialChoiceDialog) {
          info += "Esperando selección...";
        } else if (userChoiceForExisting === 'modify_published') {
          info += "Modificando Publicado.";
        } else if (userChoiceForExisting === 'use_draft') {
          info += "Modificando Borrador.";
        } else if (userChoiceForExisting === 'generate_new_draft') {
          info += "Listo para Generar Nuevo.";
        }
        setDisplayInfoText(info);
    } else if (watchedSelectedService && watchedMonth && watchedYear) {
        setDisplayInfoText('Config: ' + watchedSelectedService.name + ' - ' + (months.find(m => m.value === watchedMonth)?.label || watchedMonth) + '/' + watchedYear + '. Cargar config.');
    } else {
        setDisplayInfoText('Seleccione servicio, mes y año, y cargue configuración.');
    }
  }, [
    configLoaded, loadedConfigValues, watchedSelectedService, watchedMonth, watchedYear,
    isLoadingHolidays, errorHolidays, holidays,
    currentLoadedPublishedSchedule, currentLoadedDraftSchedule,
    userChoiceForExisting, showInitialChoiceDialog, NL
  ]);


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
    const { serviceId, month: formMonth, year: formYear } = form.getValues();
    if (!serviceId || !formMonth || !formYear) {
      setError("Por favor, seleccione servicio, mes y año.");
      toast({ variant: "destructive", title: "Error", description: "Por favor, seleccione servicio, mes y año." });
      return;
    }
    setIsLoadingConfig(true);
    setError(null);
    resetScheduleState();
    try {
      const published = await getPublishedMonthlySchedule(formYear, formMonth, serviceId);
      const draft = await getDraftMonthlySchedule(formYear, formMonth, serviceId);
      setCurrentLoadedPublishedSchedule(published);
      setCurrentLoadedDraftSchedule(draft);

      const currentMonthDate = new Date(parseInt(formYear), parseInt(formMonth) - 1, 1);
      const prevMonthDate = subMonths(currentMonthDate, 1);
      const prevMonthYearStr = format(prevMonthDate, 'yyyy');
      const prevMonthMonthStr = format(prevMonthDate, 'M');
      const prevSchedule = await getPublishedMonthlySchedule(prevMonthYearStr, prevMonthMonthStr, serviceId);
      setPreviousMonthSchedule(prevSchedule);

      setConfigLoaded(true);
      setLoadedConfigValues({serviceId, month: formMonth, year: formYear});

      if (published || draft) {
        setShowInitialChoiceDialog(true);
      } else {
        setUserChoiceForExisting('generate_new_draft');
        setCurrentEditingSource('new');
        setShowInitialChoiceDialog(false);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "No se pudo cargar la configuración del horario.";
      setError(errorMessage);
      toast({ variant: "destructive", title: "Error de Carga", description: errorMessage });
      resetScheduleState();
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const handleInitialChoice = (choice: 'modify_published' | 'use_draft' | 'generate_new_draft') => {
    setShowInitialChoiceDialog(false);
    setUserChoiceForExisting(choice);

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
    } else {
      setCurrentEditingSource('new');
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
    setShowGrid(false);
    setCurrentEditingSource('new');

    try {
      const result = await generateAlgorithmicSchedule(
        watchedSelectedService,
        loadedConfigValues.month,
        loadedConfigValues.year,
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
        const employeesInService = allEmployees.filter(emp => emp.serviceIds.includes(loadedConfigValues.serviceId));

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
        setError("Faltan datos para guardar. Asegúrese de que la configuración esté cargada y haya turnos para guardar.");
        toast({ variant: "destructive", title: "Error al Guardar", description: "Faltan datos críticos (configuración o turnos)." });
        return;
    }

    setIsSaving(true);
    setError(null);

    let scoreToSave: number | null | undefined = generatedScore;
    let violationsToSave: ScheduleViolation[] | null | undefined = generatedViolations;
    let breakdownToSave: ScoreBreakdown | null | undefined = generatedScoreBreakdown;
    let responseTextToSave: string | null | undefined = generatedResponseText;

    if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) {
        scoreToSave = generatedScore ?? currentLoadedDraftSchedule.score ?? null;
        violationsToSave = generatedViolations ?? currentLoadedDraftSchedule.violations ?? [];
        breakdownToSave = generatedScoreBreakdown ?? currentLoadedDraftSchedule.scoreBreakdown ?? undefined;
        responseTextToSave = generatedResponseText ?? currentLoadedDraftSchedule.responseText ?? "Borrador guardado.";
    } else if (currentEditingSource === 'published' && currentLoadedPublishedSchedule) {
        scoreToSave = generatedScore ?? currentLoadedPublishedSchedule.score ?? null;
        violationsToSave = generatedViolations ?? currentLoadedPublishedSchedule.violations ?? [];
        breakdownToSave = generatedScoreBreakdown ?? currentLoadedPublishedSchedule.scoreBreakdown ?? undefined;
        responseTextToSave = generatedResponseText ?? currentLoadedPublishedSchedule.responseText ?? "Horario modificado guardado.";
    }

    const schedulePayloadBase = {
        scheduleKey: generateScheduleKey(loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId),
        year: loadedConfigValues.year,
        month: loadedConfigValues.month,
        serviceId: loadedConfigValues.serviceId,
        serviceName: watchedSelectedService.name,
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
            if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) {
              draftIdToUseForUpdate = currentLoadedDraftSchedule.id;
            } else if (currentEditingSource === 'published') {
              draftIdToUseForUpdate = await getDraftMonthlySchedule(loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId).then(d => d?.id);
            }
            savedSchedule = await saveOrUpdateDraftSchedule(schedulePayloadBase, draftIdToUseForUpdate);
            setCurrentLoadedDraftSchedule(savedSchedule);
            setCurrentEditingSource('draft');
            toast({ title: "Borrador Guardado", description: `Borrador para ${watchedSelectedService.name} - ${months.find(m=>m.value===loadedConfigValues.month)?.label}/${loadedConfigValues.year} guardado.` });
        } else if (action === 'publish_draft') {
            const draftIdToArchive = (currentEditingSource === 'draft' && currentLoadedDraftSchedule) ? currentLoadedDraftSchedule.id : undefined;
            if (!draftIdToArchive) throw new Error("No se puede publicar un borrador sin un ID de borrador válido. Asegúrese de que está editando un borrador existente.");

            savedSchedule = await publishSchedule(schedulePayloadBase, draftIdToArchive);
            setCurrentLoadedPublishedSchedule(savedSchedule);
            setCurrentLoadedDraftSchedule(null);
            setCurrentEditingSource('published');
            toast({ title: "Borrador Publicado", description: `El borrador se publicó como activo.` });
        } else if (action === 'publish_new_from_scratch') {
            savedSchedule = await publishSchedule(schedulePayloadBase);
            setCurrentLoadedPublishedSchedule(savedSchedule);
            setCurrentLoadedDraftSchedule(null);
            setCurrentEditingSource('published');
            toast({ title: "Horario Publicado", description: `El nuevo horario se publicó como activo.` });
        } else if (action === 'publish_modified_published') {
            if (!currentLoadedPublishedSchedule) throw new Error("No hay horario publicado cargado para modificar y republicar.");
            savedSchedule = await publishSchedule(schedulePayloadBase, undefined); // No specific draft ID needed, it archives old published
            setCurrentLoadedPublishedSchedule(savedSchedule);
            setCurrentLoadedDraftSchedule(null);
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
        if (loadedConfigValues) {
            queryClient.invalidateQueries({ queryKey: ['publishedMonthlySchedule', loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId] });
            queryClient.invalidateQueries({ queryKey: ['draftMonthlySchedule', loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId] });
        }
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
    if (!loadedConfigValues) return false; // If no config loaded yet, assume selection can change
    const currentFormValues = form.getValues();
    return currentFormValues.serviceId !== loadedConfigValues.serviceId ||
           currentFormValues.month !== loadedConfigValues.month ||
           currentFormValues.year !== loadedConfigValues.year;
  };


  const getSaveDialogOptions = () => {
    const options: { label: string; action: () => void; icon: JSX.Element; variant?: "default" | "outline" }[] = [];
    if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) {
        options.push({ label: "Guardar Borrador", action: () => handleConfirmSave('save_draft'), icon: <FileText className="mr-2 h-4 w-4" />, variant: "outline" });
        options.push({ label: "Publicar Borrador", action: () => handleConfirmSave('publish_draft'), icon: <UploadCloud className="mr-2 h-4 w-4" /> });
    } else if (currentEditingSource === 'published' && currentLoadedPublishedSchedule) {
        options.push({ label: "Publicar como Nueva Versión", action: () => handleConfirmSave('publish_modified_published'), icon: <UploadCloud className="mr-2 h-4 w-4" /> });
        options.push({ label: "Guardar Cambios como Borrador", action: () => handleConfirmSave('save_draft'), icon: <FileText className="mr-2 h-4 w-4" />, variant: "outline" });
    } else { // 'new' or no specific source (e.g., after algo generation)
        options.push({ label: "Guardar como Borrador", action: () => handleConfirmSave('save_draft'), icon: <FileText className="mr-2 h-4 w-4" />, variant: "outline" });
        options.push({ label: "Guardar y Publicar", action: () => handleConfirmSave('publish_new_from_scratch'), icon: <UploadCloud className="mr-2 h-4 w-4" /> });
    }
    return options;
  };

  const getInitialChoiceDialogDescription = () => {
    let desc = "Horarios existentes encontrados para " +
               `${watchedSelectedService?.name || 'Servicio Desconocido'} - ` +
               `${months.find(m => m.value === loadedConfigValues?.month)?.label || loadedConfigValues?.month}/${loadedConfigValues?.year}. `;
    if (currentLoadedPublishedSchedule) {
      desc += `Hay un horario PUBLICADO (v${currentLoadedPublishedSchedule.version}). `;
    }
    if (currentLoadedDraftSchedule) {
      desc += `Hay un BORRADOR (v${currentLoadedDraftSchedule.version}). `;
    }
    desc += "¿Qué acción desea realizar?";
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
    const { serviceId, month: localMonth, year: localYear } = loadedConfigValues;
    const scheduleKey = generateScheduleKey(localYear, localMonth, serviceId);

    try {
      const count = await dangerouslyDeleteAllSchedulesForKey(scheduleKey);
      toast({ title: "Eliminación Exitosa (Test)", description: `Se eliminaron ${count} horarios para la clave ${scheduleKey}.` });
      queryClient.invalidateQueries({ queryKey: ['publishedMonthlySchedule', localYear, localMonth, serviceId] });
      queryClient.invalidateQueries({ queryKey: ['draftMonthlySchedule', localYear, localMonth, serviceId] });
      resetScheduleState(); // Resetea todo
      if (showGrid) {
        handleBackToConfig(); // Vuelve a la vista de config si estaba en la grilla
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
  
  const canGenerate = (
    configLoaded &&
    (userChoiceForExisting === 'generate_new_draft' || (!currentLoadedPublishedSchedule && !currentLoadedDraftSchedule)) &&
    !isFormSelectionChanged()
  );

  let scoreToDisplayInEval: number | null | undefined = null;
  let violationsToDisplayInEval: ScheduleViolation[] | null | undefined = null;
  let breakdownToDisplayInEval: ScoreBreakdown | null | undefined = null;

  if (showGrid && editableShifts) {
    scoreToDisplayInEval = generatedScore;
    violationsToDisplayInEval = generatedViolations;
    breakdownToDisplayInEval = generatedScoreBreakdown;
  } else if (algorithmGeneratedShifts && algorithmGeneratedShifts.length > 0) {
    scoreToDisplayInEval = generatedScore;
    violationsToDisplayInEval = generatedViolations;
    breakdownToDisplayInEval = generatedScoreBreakdown;
  } else if (currentEditingSource === 'draft' && currentLoadedDraftSchedule) {
    scoreToDisplayInEval = currentLoadedDraftSchedule.score;
    violationsToDisplayInEval = currentLoadedDraftSchedule.violations;
    breakdownToDisplayInEval = currentLoadedDraftSchedule.scoreBreakdown;
  } else if (currentEditingSource === 'published' && currentLoadedPublishedSchedule) {
    scoreToDisplayInEval = currentLoadedPublishedSchedule.score;
    violationsToDisplayInEval = currentLoadedPublishedSchedule.violations;
    breakdownToDisplayInEval = currentLoadedPublishedSchedule.scoreBreakdown;
  }
  
  console.log("Preparing to render ShiftGeneratorForm");
  return (
    <Card className="w-full">
      {!showGrid ? (
        <>
          <CardHeader>
            <CardTitle className="font-headline">Configuración de Generación de Horario</CardTitle>
            <CardDescription>
              Seleccione el servicio, mes y año. Cargue la configuración para ver/editar borradores, horarios publicados o generar uno nuevo.
            </CardDescription>
          </CardHeader>
          <Form {...form}>
            <form> {/* No onSubmit aquí, los botones de acción manejan la lógica */}
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <FormField control={form.control} name="serviceId" render={({ field }) => (
                    <FormItem> <FormLabel>Servicio</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingConfig}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar Servicio" /></SelectTrigger></FormControl>
                        <SelectContent>{allServices.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>)} />
                  <FormField control={form.control} name="month" render={({ field }) => (
                    <FormItem> <FormLabel>Mes</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingConfig}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger></FormControl>
                        <SelectContent>{months.map(m => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>)} />
                  <FormField control={form.control} name="year" render={({ field }) => (
                    <FormItem> <FormLabel>Año</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingConfig}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Año" /></SelectTrigger></FormControl>
                        <SelectContent>{years.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}</SelectContent>
                      </Select><FormMessage />
                    </FormItem>)} />
                </div>
                <Button type="button" onClick={handleLoadConfiguration} className="w-full md:w-auto" disabled={isActionDisabled || !form.formState.isValid || isFormSelectionChanged()}>
                  {isLoadingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
                  Cargar Configuración
                </Button>
                 {configLoaded && (
                     <Button type="button" onClick={handleDeleteSchedulesRequest} variant="destructive" className="w-full md:w-auto ml-2" disabled={isActionDisabled || !configLoaded}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar Horarios (TEST)
                    </Button>
                 )}

                {isFormSelectionChanged() && configLoaded && (
                    <Alert variant="default" className="mt-2">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Cambios en Selección</AlertTitle>
                        <AlertDescription>
                        La selección de servicio, mes o año ha cambiado. Recargue la configuración para aplicar.
                        </AlertDescription>
                    </Alert>
                )}

                {configLoaded && !showInitialChoiceDialog && (
                  <div className="mt-4">
                    <h3 className="font-semibold text-lg mb-2">Acciones Disponibles:</h3>
                    <div className="flex flex-col sm:flex-row gap-2">
                       {(userChoiceForExisting === 'generate_new_draft' || (!currentLoadedPublishedSchedule && !currentLoadedDraftSchedule)) && (
                        <Button
                          type="button"
                          onClick={() => handleGenerateSubmit(form.getValues())}
                          className="flex-1"
                          disabled={isActionDisabled || !canGenerate}
                          variant="default"
                        >
                          {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                          Generar Nuevo Horario Algorítmico
                        </Button>
                       )}
                        {(currentLoadedPublishedSchedule || currentLoadedDraftSchedule) && (
                           <Alert variant="default" className="w-full">
                                <BookMarked className="h-4 w-4"/>
                                <AlertTitle>Horario Existente Cargado</AlertTitle>
                                <AlertDescription>
                                    {currentEditingSource === 'published' && 'Estás viendo/editando el horario PUBLICADO. '}
                                    {currentEditingSource === 'draft' && 'Estás viendo/editando un BORRADOR. '}
                                    {(currentEditingSource !== 'published' && currentEditingSource !== 'draft' && (userChoiceForExisting === 'generate_new_draft' || (!currentLoadedPublishedSchedule && !currentLoadedDraftSchedule))) && 'Puedes generar uno nuevo, o recargar la configuración si los filtros cambiaron.'}
                                    Usa el botón "Ver/Editar Grilla" para modificarlo.
                                </AlertDescription>
                           </Alert>
                        )}
                    </div>
                  </div>
                )}

                {error && <Alert variant="destructive" className="mt-4"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
                {generatedResponseText && !error && !showGrid && (
                    <Alert variant="default" className="mt-4">
                        <ClipboardCheck className="h-4 w-4"/>
                        <AlertTitle>{generatedResponseText.startsWith("Evaluación") ? "Evaluación" : "Respuesta del Generador"}</AlertTitle>
                        <AlertDescription className="whitespace-pre-wrap">{generatedResponseText}</AlertDescription>
                    </Alert>
                )}
                 {displayInfoText && (
                    <Alert variant="default" className="mt-4">
                        <Info className="h-4 w-4"/>
                        <AlertTitle>Estado Actual</AlertTitle>
                        <AlertDescription className="whitespace-pre-wrap">{displayInfoText}</AlertDescription>
                    </Alert>
                )}

              </CardContent>
              <CardFooter className="flex-col items-start space-y-2 md:flex-row md:justify-between md:space-y-0">
                <div>
                {(editableShifts || algorithmGeneratedShifts) && configLoaded && (
                    <Button type="button" onClick={() => setShowGrid(true)} variant="outline" disabled={isActionDisabled || !(editableShifts || algorithmGeneratedShifts)}>
                        <Eye className="mr-2 h-4 w-4" /> Ver/Editar Grilla
                    </Button>
                )}
                </div>
                 <div>
                {(editableShifts) && configLoaded && !showGrid && (
                  <Button type="button" onClick={handleSaveGeneratedShiftsClick} variant="default" disabled={isActionDisabled || !editableShifts || editableShifts.length === 0}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar Horario Actual
                  </Button>
                )}
                </div>
              </CardFooter>
            </form>
          </Form>
        </>
      ) : ( // Show Grid is true
        <>
          {editableShifts && watchedSelectedService && loadedConfigValues && (
            <>
              <InteractiveScheduleGrid
                initialShifts={editableShifts}
                allEmployees={allEmployees}
                targetService={watchedSelectedService}
                month={loadedConfigValues.month}
                year={loadedConfigValues.year}
                holidays={holidays}
                onShiftsChange={setEditableShifts}
                onBackToConfig={handleBackToConfig}
              />
              <div className="mt-4 flex flex-col sm:flex-row justify-between gap-2">
                <Button onClick={handleReevaluateSchedule} variant="outline" disabled={isActionDisabled || isReevaluating}>
                  {isReevaluating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Re-evaluar Horario
                </Button>
                <Button onClick={handleSaveGeneratedShiftsClick} variant="default" disabled={isActionDisabled || !editableShifts || editableShifts.length === 0}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar Cambios del Horario
                </Button>
              </div>
            </>
          )}
          {(scoreToDisplayInEval !== null || (violationsToDisplayInEval && violationsToDisplayInEval.length > 0) || breakdownToDisplayInEval) && (
             <ScheduleEvaluationDisplay
                score={scoreToDisplayInEval}
                violations={violationsToDisplayInEval}
                scoreBreakdown={breakdownToDisplayInEval}
                context="generator"
             />
          )}
          {error && <Alert variant="destructive" className="mt-4"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          {generatedResponseText && !error && (
            <Alert variant="default" className="mt-4">
                <ClipboardCheck className="h-4 w-4"/>
                <AlertTitle>{generatedResponseText.startsWith("Evaluación") ? "Resultado de Evaluación" : "Respuesta del Generador"}</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">{generatedResponseText}</AlertDescription>
            </Alert>
          )}
        </>
      )}

      <AlertDialog open={showInitialChoiceDialog} onOpenChange={setShowInitialChoiceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Horario Existente Encontrado</AlertDialogTitle>
            <AlertDialogDescription>{getInitialChoiceDialogDescription()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => handleInitialChoice('generate_new_draft')} className="w-full sm:w-auto">
                <FilePlus2 className="mr-2 h-4 w-4" /> Generar Borrador Nuevo
            </Button>
            {currentLoadedDraftSchedule && (
              <Button variant="outline" onClick={() => handleInitialChoice('use_draft')} className="w-full sm:w-auto">
                <Edit3 className="mr-2 h-4 w-4" /> Usar/Editar Borrador
              </Button>
            )}
            {currentLoadedPublishedSchedule && (
              <Button variant="default" onClick={() => handleInitialChoice('modify_published')} className="w-full sm:w-auto">
                 <Edit className="mr-2 h-4 w-4" /> Cargar y Modificar Publicado
              </Button>
            )}
            <AlertDialogCancel onClick={() => { setShowInitialChoiceDialog(false); resetScheduleState(); }} className="mt-2 sm:mt-0 w-full sm:w-auto">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Acción de Guardado</AlertDialogTitle>
            <AlertDialogDescription>
              Seleccione cómo desea guardar el horario actual para {watchedSelectedService?.name} - {months.find(m=>m.value===loadedConfigValues?.month)?.label}/{loadedConfigValues?.year}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col space-y-2 mt-4">
            {getSaveDialogOptions().map(opt => (
              <Button key={opt.label} variant={opt.variant || "default"} onClick={opt.action} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : opt.icon}
                {opt.label}
              </Button>
            ))}
          </div>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¡ADVERTENCIA! Eliminar Horarios (Solo Pruebas)</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción eliminará PERMANENTEMENTE <strong>TODOS</strong> los horarios (publicados, borradores, archivados) para
                    la clave: <strong className="text-destructive">{loadedConfigValues ? generateScheduleKey(loadedConfigValues.year, loadedConfigValues.month, loadedConfigValues.serviceId) : 'N/A'}</strong>.
                    Esta acción no se puede deshacer y es solo para fines de prueba.
                    Escriba <code className="bg-muted px-1 py-0.5 rounded text-destructive font-mono">{TEST_DELETE_PASSWORD}</code> para confirmar.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
                <Label htmlFor="delete-password">Contraseña de Confirmación:</Label>
                <Input
                    id="delete-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className={deleteErrorMessage ? "border-destructive focus-visible:ring-destructive" : ""}
                    disabled={isDeletingSchedules}
                />
                {deleteErrorMessage && <p className="text-sm text-destructive">{deleteErrorMessage}</p>}
            </div>
            <AlertDialogFooter className="mt-4">
                <AlertDialogCancel disabled={isDeletingSchedules}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                    onClick={handleConfirmDeleteSchedules}
                    disabled={deletePassword !== TEST_DELETE_PASSWORD || isDeletingSchedules}
                    className="bg-destructive hover:bg-destructive/90"
                >
                    {isDeletingSchedules ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Sí, Eliminar TODO para esta Clave
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

    </Card>
  );
}
// Unique comment to force re-evaluation: 2024-08-01-ULTRA-PERSISTENT-FIX-SIMPLIFY-MORE-JSX-TEST-FINAL-RESTORED
