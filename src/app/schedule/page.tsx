
"use client";

import PageHeader from '@/components/common/page-header';
import ShiftGeneratorForm from '@/components/schedule/shift-generator-form';
import InteractiveScheduleGrid from '@/components/schedule/InteractiveScheduleGrid';
import ScheduleEvaluationDisplay from '@/components/schedule/schedule-evaluation-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Employee, Service, MonthlySchedule, Holiday } from '@/lib/types';
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getEmployees } from '@/lib/firebase/employees';
import { getServices } from '@/lib/firebase/services';
import { getPublishedMonthlySchedule, archiveSchedule } from '@/lib/firebase/monthlySchedules';
import { getHolidays } from '@/lib/firebase/holidays';
import { Loader2, CalendarSearch, AlertTriangle, Info, UploadCloud, ArchiveIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { es } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';


const currentYear = new Date().getFullYear();
const scheduleYears = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());
const scheduleMonths = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString(),
  label: format(new Date(currentYear, i), 'MMMM', { locale: es }),
}));

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedYearView, setSelectedYearView] = useState<string>(currentYear.toString());
  const [selectedMonthView, setSelectedMonthView] = useState<string>((new Date().getMonth() + 1).toString());
  const [selectedServiceIdView, setSelectedServiceIdView] = useState<string | undefined>(undefined);
  
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [scheduleToArchiveId, setScheduleToArchiveId] = useState<string | null>(null);
  const [viewableScheduleData, setViewableScheduleData] = useState<MonthlySchedule | null>(null);


  const { data: employees = [], isLoading: isLoadingEmployees, error: errorEmployees } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: getEmployees,
  });
  const { data: services = [], isLoading: isLoadingServices, error: errorServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: getServices,
  });
  const { data: holidays = [], isLoading: isLoadingHolidays, error: errorHolidays } = useQuery<Holiday[]>({
    queryKey: ['holidays'],
    queryFn: getHolidays,
  });


  useEffect(() => {
    if (services.length > 0 && !selectedServiceIdView) {
      setSelectedServiceIdView(services[0].id);
    }
  }, [services, selectedServiceIdView]);

  const {
    data: fetchedViewableSchedule, 
    isLoading: isLoadingViewableSchedule,
    error: errorViewableSchedule,
    refetch: manualRefetchViewableSchedule,
  } = useQuery<MonthlySchedule | null>({
    queryKey: ['publishedMonthlySchedule', selectedYearView, selectedMonthView, selectedServiceIdView],
    queryFn: async () => {
      if (!selectedServiceIdView || !selectedYearView || !selectedMonthView) {
        return null;
      }
      return getPublishedMonthlySchedule(selectedYearView, selectedMonthView, selectedServiceIdView);
    },
    enabled: !!(selectedServiceIdView && selectedMonthView && selectedYearView), 
  });
  
  useEffect(() => {
    // When filters change, clear the currently displayed data
    setViewableScheduleData(null);
  }, [selectedServiceIdView, selectedMonthView, selectedYearView]);

  useEffect(() => {
    // This effect runs when fetchedViewableSchedule (data from query) changes
    // or if the query is loading (to potentially show loading state or clear old data faster).
    // If filters are not complete, fetchedViewableSchedule will be undefined due to query being disabled.
    if (selectedServiceIdView && selectedMonthView && selectedYearView) {
      setViewableScheduleData(fetchedViewableSchedule ?? null);
    } else {
      setViewableScheduleData(null); // Ensure data is cleared if filters become incomplete
    }
  }, [fetchedViewableSchedule, selectedServiceIdView, selectedMonthView, selectedYearView]);


  const selectedServiceForView = useMemo(() => {
    return services.find(s => s.id === selectedServiceIdView);
  }, [selectedServiceIdView, services]);

  const isLoading = isLoadingEmployees || isLoadingServices || isLoadingHolidays;
  const dataError = errorEmployees || errorServices || errorHolidays;

  const handleLoadRefreshSchedule = () => {
    if (selectedServiceIdView && selectedYearView && selectedMonthView) {
      manualRefetchViewableSchedule();
    } else {
        toast({
            variant: "destructive",
            title: "Faltan Filtros",
            description: "Por favor, seleccione servicio, mes y año antes de cargar.",
        });
    }
  };

  const archiveScheduleMutation = useMutation({
    mutationFn: archiveSchedule,
    onSuccess: () => {
      toast({ title: "Horario Archivado", description: "El horario publicado ha sido archivado exitosamente." });
      setViewableScheduleData(null); 
      queryClient.invalidateQueries({ queryKey: ['publishedMonthlySchedule', selectedYearView, selectedMonthView, selectedServiceIdView] });
      setIsArchiveDialogOpen(false);
      setScheduleToArchiveId(null);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error al Archivar", description: error.message });
      setIsArchiveDialogOpen(false);
      setScheduleToArchiveId(null);
    },
  });

  const handleArchiveClick = () => {
    if (viewableScheduleData) {
      setScheduleToArchiveId(viewableScheduleData.id);
      setIsArchiveDialogOpen(true);
    }
  };

  const confirmArchive = () => {
    if (scheduleToArchiveId) {
      archiveScheduleMutation.mutate(scheduleToArchiveId);
    }
  };


  if (isLoading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="container mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5 mr-2"/>
          <AlertTitle>Error al Cargar Datos del Horario</AlertTitle>
          <AlertDescription>{dataError.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Horario de Turnos"
        description="Vea horarios publicados y genere/edite borradores. Los horarios pueden ser guardados o publicados."
      />
      <Tabs defaultValue="view-schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-2 md:w-1/2 mb-6">
          <TabsTrigger value="view-schedule">Ver Horario Publicado</TabsTrigger>
          <TabsTrigger value="generate-shifts">Generar/Editar Borradores</TabsTrigger>
        </TabsList>

        <TabsContent 
          value="view-schedule" 
          className="mt-6"
        >
          <Card className="mb-6 shadow-md hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="flex items-center text-xl font-headline">
                <CalendarSearch className="mr-3 h-6 w-6 text-primary"/>
                Visualizar Horario Publicado
              </CardTitle>
              <CardDescription>
                Seleccione el servicio, mes y año para cargar el horario publicado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select value={selectedServiceIdView} onValueChange={setSelectedServiceIdView}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar Servicio" /></SelectTrigger>
                  <SelectContent>
                    {services.map(service => (
                      <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedMonthView} onValueChange={setSelectedMonthView}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar Mes" /></SelectTrigger>
                  <SelectContent>
                    {scheduleMonths.map(m => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={selectedYearView} onValueChange={setSelectedYearView}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar Año" /></SelectTrigger>
                  <SelectContent>
                    {scheduleYears.map(y => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleLoadRefreshSchedule}
                disabled={!selectedServiceIdView || !selectedMonthView || !selectedYearView || isLoadingViewableSchedule || archiveScheduleMutation.isPending}
                className="w-full md:w-auto mt-2"
              >
                {isLoadingViewableSchedule ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UploadCloud className="mr-2 h-4 w-4" />}
                Cargar/Refrescar Horario
              </Button>
            </CardContent>
            {viewableScheduleData && (
              <CardFooter className="border-t pt-4">
                <Button
                  variant="outline"
                  onClick={handleArchiveClick}
                  disabled={isLoadingViewableSchedule || archiveScheduleMutation.isPending}
                  className="w-full md:w-auto"
                >
                  {archiveScheduleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ArchiveIcon className="mr-2 h-4 w-4" />}
                  Archivar Horario Publicado
                </Button>
              </CardFooter>
            )}
          </Card>

          {isLoadingViewableSchedule && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Cargando horario publicado...</p>
            </div>
          )}
          {errorViewableSchedule && (
             <Alert variant="destructive" className="mt-4">
               <AlertTriangle className="h-5 w-5 mr-2"/>
               <AlertTitle>Error al Cargar Horario Publicado</AlertTitle>
               <AlertDescription>{(errorViewableSchedule as Error).message || "No se pudo cargar el horario seleccionado."}</AlertDescription>
             </Alert>
          )}
          {!isLoadingViewableSchedule && !errorViewableSchedule && selectedServiceIdView && selectedMonthView && selectedYearView && (
            viewableScheduleData ? (
              <>
                <InteractiveScheduleGrid
                  initialShifts={viewableScheduleData.shifts}
                  allEmployees={employees}
                  targetService={selectedServiceForView}
                  month={selectedMonthView}
                  year={selectedYearView}
                  holidays={holidays}
                  isReadOnly={true}
                />
                <ScheduleEvaluationDisplay
                  score={viewableScheduleData.score}
                  violations={viewableScheduleData.violations}
                  scoreBreakdown={viewableScheduleData.scoreBreakdown}
                  context="viewer"
                />
              </>
            ) : (
              <Alert className="mt-4">
                <Info className="h-5 w-5 mr-2"/>
                <AlertTitle>No se encontró un horario publicado</AlertTitle>
                <AlertDescription>
                  No hay un horario publicado para {selectedServiceForView?.name || 'el servicio seleccionado'} en {scheduleMonths.find(m => m.value === selectedMonthView)?.label || ''} {selectedYearView}.
                  Puede generar uno en la pestaña "Generar/Editar Borradores".
                </AlertDescription>
              </Alert>
            )
          )}
          {(!selectedServiceIdView || !selectedMonthView || !selectedYearView && !isLoadingViewableSchedule && !viewableScheduleData) && ( 
             <Alert variant="default" className="mt-4">
                <Info className="h-5 w-5 mr-2"/>
                <AlertTitle>Seleccione Filtros y Cargue</AlertTitle>
                <AlertDescription>Por favor, elija un servicio, mes y año, y luego haga clic en "Cargar/Refrescar Horario" para ver el horario publicado.</AlertDescription>
             </Alert>
          )}
        </TabsContent>

        <TabsContent value="generate-shifts" className="mt-6">
          <ShiftGeneratorForm
            allEmployees={employees}
            allServices={services}
          />
        </TabsContent>
      </Tabs>
      <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción marcará el horario publicado de {selectedServiceForView?.name} para {scheduleMonths.find(m => m.value === selectedMonthView)?.label || ''} {selectedYearView} como ARCHIVADO.
              No se podrá ver directamente en esta vista, pero permanecerá en el historial para auditoría. ¿Desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveScheduleMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive} disabled={archiveScheduleMutation.isPending} className="bg-orange-600 hover:bg-orange-700">
              {archiveScheduleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArchiveIcon className="mr-2 h-4 w-4" /> }
              Sí, Archivar Horario
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
    
