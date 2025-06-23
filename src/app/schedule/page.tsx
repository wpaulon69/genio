"use client";

import PageHeader from '@/components/common/page-header';
import ShiftGeneratorForm from '@/components/schedule/shift-generator-form';
import InteractiveScheduleGrid from '@/components/schedule/InteractiveScheduleGrid';
import ScheduleEvaluationDisplay from '@/components/schedule/schedule-evaluation-display';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Employee, Service, MonthlySchedule, Holiday } from '@/lib/types';
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Loader2, CalendarSearch, AlertTriangle, Info, UploadCloud, ArchiveIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { es } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import ClientOnly from '@/components/common/client-only';
import { getGridShiftTypeFromAIShift } from '@/components/schedule/InteractiveScheduleGrid'; // Importar la función necesaria
import { getDaysInMonth } from 'date-fns'; // Importar getDaysInMonth


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
  
  const [availableSchedules, setAvailableSchedules] = useState<MonthlySchedule[]>([]);
  const [selectedScheduleToDisplay, setSelectedScheduleToDisplay] = useState<MonthlySchedule | null>(null);


  const { data: employees = [], isLoading: isLoadingEmployees, error: errorEmployees } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => fetch('/api/employees').then(res => res.json()),
  });
  const { data: services = [], isLoading: isLoadingServices, error: errorServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => {
      console.log("Fetching /api/services");
      const response = await fetch('/api/services');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
  });
  const { data: holidays = [], isLoading: isLoadingHolidays, error: errorHolidays } = useQuery<Holiday[]>({
    queryKey: ['holidays'],
    queryFn: async () => fetch('/api/holidays').then(res => res.json()),
  });


  // Initialize selectedServiceIdView with the first service once services are loaded
  useEffect(() => {
    if (services.length > 0 && !selectedServiceIdView) {
      setSelectedServiceIdView(services[0].id_servicio.toString());
    }
  }, [services, selectedServiceIdView]);

  // Fetch all schedules (draft and published) based on current filters
  const {
    data: fetchedSchedulesList,
    isLoading: isLoadingSchedulesList,
    error: errorSchedulesList,
    refetch: manualRefetchSchedulesList,
  } = useQuery<MonthlySchedule[]>({
    queryKey: ['allMonthlySchedules', selectedYearView, selectedMonthView, selectedServiceIdView],
    queryFn: async () => {
      if (!selectedServiceIdView || !selectedYearView || !selectedMonthView) {
        return [];
      }
      // Fetch all statuses (draft, published)
      const url = `/api/monthlySchedules?year=${selectedYearView}&month=${selectedMonthView}&serviceId=${selectedServiceIdView}`;
      console.log("[SchedulePage] Fetching schedules from URL:", url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch schedules');
      const data = await response.json();
      console.log("[SchedulePage] Fetched schedules data:", data);
      return data;
    },
    enabled: !!(selectedServiceIdView && selectedMonthView && selectedYearView),
  });

  useEffect(() => {
    console.log("[SchedulePage] useEffect for fetchedSchedulesList, value:", fetchedSchedulesList);
    if (selectedServiceIdView && selectedMonthView && selectedYearView) {
      const schedules = fetchedSchedulesList ?? [];
      setAvailableSchedules(schedules);
      if (schedules.length > 0) {
        // Auto-select the first schedule for display
        console.log("[SchedulePage] Auto-selecting first schedule:", schedules[0]);
        if (schedules[0].shifts && schedules[0].shifts.length > 0) {
            console.log("[SchedulePage] First shift s.date type of auto-selected:", typeof schedules[0].shifts[0].date, "value:", schedules[0].shifts[0].date);
        }
        setSelectedScheduleToDisplay(schedules[0]);
      } else {
        setSelectedScheduleToDisplay(null);
      }
    } else {
      setAvailableSchedules([]);
      setSelectedScheduleToDisplay(null);
    }
  }, [fetchedSchedulesList, selectedServiceIdView, selectedMonthView, selectedYearView]);

  // Effect to refetch when filters change.
  useEffect(() => {
    setAvailableSchedules([]); // Clear old data immediately on filter change
    setSelectedScheduleToDisplay(null);
    if (selectedServiceIdView && selectedMonthView && selectedYearView) {
      manualRefetchSchedulesList();
    }
  }, [selectedServiceIdView, selectedMonthView, selectedYearView]);


  const selectedServiceForView = useMemo(() => {
    return services.find(s => s.id_servicio.toString() === selectedServiceIdView);
  }, [selectedServiceIdView, services]);

  const isLoading = isLoadingEmployees || isLoadingServices || isLoadingHolidays;
  const dataError = errorEmployees || errorServices || errorHolidays;

  console.log("Services in SchedulePage:", services);

  const handleLoadRefreshSchedule = () => {
    if (selectedServiceIdView && selectedYearView && selectedMonthView) {
      manualRefetchSchedulesList();
      setSelectedScheduleToDisplay(null); // Clear selection on refresh
    } else {
        toast({
            variant: "destructive",
            title: "Faltan Filtros",
            description: "Por favor, seleccione servicio, mes y año antes de cargar.",
        });
    }
  };

  const archiveScheduleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      // La lógica de archivo debería estar en una ruta de API
      // Por ahora, se simula la operación
      console.log(`Archiving schedule ${scheduleId}`);
      return Promise.resolve();
    },
    onSuccess: () => {
      toast({ title: "Horario Archivado", description: "El horario publicado ha sido archivado exitosamente." });
      // Invalidate the query to refetch the (now non-existent or different) published schedule
      queryClient.invalidateQueries({ queryKey: ['publishedMonthlySchedule', selectedYearView, selectedMonthView, selectedServiceIdView] });
      // viewableScheduleData will be updated by the useEffect watching fetchedViewableSchedule
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
    if (selectedScheduleToDisplay && selectedScheduleToDisplay.status === 'published') {
      setScheduleToArchiveId(selectedScheduleToDisplay.id);
      setIsArchiveDialogOpen(true);
    } else {
      toast({ title: "Acción no permitida", description: "Solo se pueden archivar horarios publicados."});
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
                      <SelectItem key={service.id_servicio} value={service.id_servicio.toString()}>{service.nombre_servicio}</SelectItem>
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
                disabled={!selectedServiceIdView || !selectedMonthView || !selectedYearView || isLoadingSchedulesList || archiveScheduleMutation.isPending}
                className="w-full md:w-auto mt-2"
              >
                {isLoadingSchedulesList ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UploadCloud className="mr-2 h-4 w-4" />}
                Cargar/Refrescar Horarios
              </Button>
            </CardContent>
          </Card>

          {isLoadingSchedulesList && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Cargando horarios...</p>
            </div>
          )}
          {errorSchedulesList && (
             <Alert variant="destructive" className="mt-4">
               <AlertTriangle className="h-5 w-5 mr-2"/>
               <AlertTitle>Error al Cargar Horarios</AlertTitle>
               <AlertDescription>{(errorSchedulesList as Error).message || "No se pudieron cargar los horarios."}</AlertDescription>
             </Alert>
          )}

          {!isLoadingSchedulesList && !errorSchedulesList && selectedServiceIdView && selectedMonthView && selectedYearView && (
            <>
              {availableSchedules.length > 0 ? (
                <Card className="mt-4">
                  <CardHeader><CardTitle>Horarios Disponibles</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {availableSchedules.map(schedule => (
                        <li key={schedule.id} className="p-2 border rounded-md hover:bg-accent cursor-pointer flex justify-between items-center" onClick={() => {
                          console.log("[SchedulePage] Clicked on schedule object:", schedule);
                          console.log("[SchedulePage] Clicked schedule.shifts:", schedule.shifts);
                          console.log("[SchedulePage] Clicked schedule.shifts.length:", schedule.shifts?.length);
                          if (schedule.shifts && schedule.shifts.length > 0) {
                            console.log("[SchedulePage] First shift s.date type:", typeof schedule.shifts[0].date, "value:", schedule.shifts[0].date);
                          }
                          setSelectedScheduleToDisplay(schedule);
                        }}>
                          <div>
                            <span className="font-semibold">{schedule.horario_nombre || `Horario ID: ${schedule.id}`}</span>
                            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${schedule.status === 'published' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>{schedule.status}</span>
                            <p className="text-sm text-muted-foreground">Actualizado: {format(new Date(schedule.updatedAt), 'dd/MM/yyyy HH:mm')}</p>
                          </div>
                          {selectedScheduleToDisplay?.id === schedule.id && <span className="text-primary font-bold"> (Viendo)</span>}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : (
                <Alert className="mt-4">
                  <Info className="h-5 w-5 mr-2"/>
                  <AlertTitle>No se encontraron horarios</AlertTitle>
                  <AlertDescription>
                    No hay horarios (borradores o publicados) para {selectedServiceForView?.nombre_servicio || 'el servicio seleccionado'} en {scheduleMonths.find(m => m.value === selectedMonthView)?.label || ''} {selectedYearView}.
                    Puede generar uno en la pestaña "Generar/Editar Borradores".
                  </AlertDescription>
                </Alert>
              )}

              {(() => {
                console.log("[SchedulePage] Checking condition for rendering table. selectedScheduleToDisplay:", !!selectedScheduleToDisplay, "shifts.length:", selectedScheduleToDisplay?.shifts?.length, "selectedServiceForView:", !!selectedServiceForView);
                return null;
              })()}
              {selectedScheduleToDisplay && selectedScheduleToDisplay.shifts && selectedScheduleToDisplay.shifts.length > 0 && selectedServiceForView && (
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>
                      {selectedScheduleToDisplay.horario_nombre ? selectedScheduleToDisplay.horario_nombre : `Horario ID: ${selectedScheduleToDisplay.id}`}
                       <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${selectedScheduleToDisplay.status === 'published' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>{selectedScheduleToDisplay.status}</span>
                    </CardTitle>
                    <CardDescription>
                      Servicio: {selectedServiceForView.nombre_servicio} - Mes: {scheduleMonths.find(m=>m.value === selectedMonthView)?.label} {selectedYearView}
                    </CardDescription>
                     {selectedScheduleToDisplay.status === 'published' && (
                        <CardFooter className="border-t pt-4 mt-2 -mx-6 px-6 pb-0">
                          <Button
                            variant="outline"
                            onClick={handleArchiveClick}
                            disabled={isLoadingSchedulesList || archiveScheduleMutation.isPending}
                            className="w-full md:w-auto"
                          >
                            {archiveScheduleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ArchiveIcon className="mr-2 h-4 w-4" />}
                            Archivar Horario
                          </Button>
                        </CardFooter>
                      )}
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empleado</th>
                            {Array.from({ length: getDaysInMonth(new Date(parseInt(selectedYearView), parseInt(selectedMonthView) - 1)) }, (_, i) => i + 1).map(day => (
                              <th key={day} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{day}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {employees
                            .filter(emp => emp.id_servicio.toString() === selectedServiceIdView)
                            .map(employee => {
                              // console.log("[SchedulePage] ViewTable - Mapping employee:", employee.nombre); 
                              return (
                                <tr key={employee.id_empleado}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{employee.nombre}</td>
                                  {Array.from({ length: getDaysInMonth(new Date(parseInt(selectedYearView), parseInt(selectedMonthView) - 1)) }, (_, i) => i + 1).map(day => {
                                const shiftDate = format(new Date(parseInt(selectedYearView), parseInt(selectedMonthView) - 1, day), 'yyyy-MM-dd');
                                // console.log(`[SchedulePage] ViewTable - Employee: ${employee.nombre}, Comparing with shiftDate: ${shiftDate} (type: ${typeof shiftDate})`);
                                
                                const shift = selectedScheduleToDisplay.shifts.find(s => {
                                  const scheduleShiftDatePart = s.date.substring(0, 10); // Extrae YYYY-MM-DD
                                  // console.log(`[SchedulePage] ViewTable - Comparing: scheduleShiftDatePart: ${scheduleShiftDatePart} (from ${s.date}) WITH shiftDate: ${shiftDate}`);
                                  return s.employeeName === employee.nombre && scheduleShiftDatePart === shiftDate;
                                });
                                
                                if (shift) {
                                  // console.log(`[SchedulePage] ViewTable - Found shift for ${employee.nombre} on ${shiftDate}:`, shift);
                                }
                                const shiftType = shift ? getGridShiftTypeFromAIShift(shift) : '-';
                                return (
                                  <td key={`${employee.id_empleado}-${day}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{shiftType}</td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ScheduleEvaluationDisplay
                      score={selectedScheduleToDisplay.score}
                      violations={selectedScheduleToDisplay.violations}
                      scoreBreakdown={selectedScheduleToDisplay.scoreBreakdown}
                      context="viewer"
                    />
                  </CardContent>
                </Card>
              )}
               {selectedScheduleToDisplay && (!selectedScheduleToDisplay.shifts || selectedScheduleToDisplay.shifts.length === 0) && (
                 <Alert className="mt-4">
                    <Info className="h-5 w-5 mr-2"/>
                    <AlertTitle>Horario Vacío</AlertTitle>
                    <AlertDescription>
                      El horario seleccionado ({selectedScheduleToDisplay.horario_nombre || `ID: ${selectedScheduleToDisplay.id}`}) no contiene turnos.
                    </AlertDescription>
                  </Alert>
               )}
            </>
          )}
          {/* Mensaje inicial si no se han completado los filtros para la búsqueda */}
          {(!selectedServiceIdView || !selectedMonthView || !selectedYearView) && !isLoadingSchedulesList && availableSchedules.length === 0 && !selectedScheduleToDisplay && (
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
              Esta acción marcará el horario publicado de {selectedServiceForView?.nombre_servicio} para {scheduleMonths.find(m => m.value === selectedMonthView)?.label || ''} {selectedYearView} como ARCHIVADO.
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
