
"use client";

import PageHeader from '@/components/common/page-header';
import ShiftGeneratorForm from '@/components/schedule/shift-generator-form';
import InteractiveScheduleGrid from '@/components/schedule/InteractiveScheduleGrid';
import ScheduleEvaluationDisplay from '@/components/schedule/schedule-evaluation-display'; // Importar nuevo componente
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Employee, Service, MonthlySchedule, Holiday } from '@/lib/types';
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query'; // Importar useQueryClient
import { getEmployees } from '@/lib/firebase/employees';
import { getServices } from '@/lib/firebase/services';
import { getActiveMonthlySchedule } from '@/lib/firebase/monthlySchedules';
import { getHolidays } from '@/lib/firebase/holidays';
import { Loader2, CalendarSearch, AlertTriangle, Info, UploadCloud } from 'lucide-react'; // Importar UploadCloud
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button'; // Importar Button
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { es } from 'date-fns/locale';

const currentYear = new Date().getFullYear();
const scheduleYears = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());
const scheduleMonths = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString(),
  label: format(new Date(currentYear, i), 'MMMM', { locale: es }),
}));

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const [selectedYearView, setSelectedYearView] = useState<string>(currentYear.toString());
  const [selectedMonthView, setSelectedMonthView] = useState<string>((new Date().getMonth() + 1).toString());
  const [selectedServiceIdView, setSelectedServiceIdView] = useState<string | undefined>(undefined);
  const [hasAttemptedInitialLoad, setHasAttemptedInitialLoad] = useState(false);

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
    data: viewableSchedule,
    isLoading: isLoadingViewableSchedule,
    error: errorViewableSchedule,
    refetch: refetchViewableSchedule,
  } = useQuery<MonthlySchedule | null>({
    queryKey: ['monthlySchedule', selectedYearView, selectedMonthView, selectedServiceIdView],
    queryFn: () => {
      if (!selectedServiceIdView || !selectedYearView || !selectedMonthView) {
        return Promise.resolve(null);
      }
      return getActiveMonthlySchedule(selectedYearView, selectedMonthView, selectedServiceIdView);
    },
    enabled: false, // Query will not run automatically
  });

  useEffect(() => {
    // Attempt initial load once all parameters are set and if it hasn't been attempted yet
    if (selectedServiceIdView && selectedMonthView && selectedYearView && !hasAttemptedInitialLoad) {
      refetchViewableSchedule();
      setHasAttemptedInitialLoad(true);
    }
  }, [selectedServiceIdView, selectedMonthView, selectedYearView, hasAttemptedInitialLoad, refetchViewableSchedule]);


  const selectedServiceForView = useMemo(() => {
    return services.find(s => s.id === selectedServiceIdView);
  }, [selectedServiceIdView, services]);

  const isLoading = isLoadingEmployees || isLoadingServices || isLoadingHolidays;
  const dataError = errorEmployees || errorServices || errorHolidays;

  const handleLoadRefreshSchedule = () => {
    if (selectedServiceIdView && selectedYearView && selectedMonthView) {
      refetchViewableSchedule();
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
        description="Vea los horarios activos y genere nuevos usando el algoritmo. Los horarios generados y modificados se pueden guardar."
      />
      <Tabs defaultValue="view-schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-2 md:w-1/2 mb-6">
          <TabsTrigger value="view-schedule">Ver Horario Activo</TabsTrigger>
          <TabsTrigger value="generate-shifts">Generar/Editar Horarios</TabsTrigger>
        </TabsList>

        <TabsContent value="view-schedule" className="mt-6">
          <Card className="mb-6 shadow-md hover:shadow-lg transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="flex items-center text-xl font-headline">
                <CalendarSearch className="mr-3 h-6 w-6 text-primary"/>
                Visualizar Horario Activo
              </CardTitle>
              <CardDescription>
                Seleccione el servicio, mes y año para cargar el horario guardado.
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
                disabled={!selectedServiceIdView || !selectedMonthView || !selectedYearView || isLoadingViewableSchedule}
                className="w-full md:w-auto mt-2"
              >
                {isLoadingViewableSchedule ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UploadCloud className="mr-2 h-4 w-4" />}
                Cargar/Refrescar Horario
              </Button>
            </CardContent>
          </Card>

          {isLoadingViewableSchedule && (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Cargando horario...</p>
            </div>
          )}
          {errorViewableSchedule && (
             <Alert variant="destructive">
               <AlertTriangle className="h-5 w-5 mr-2"/>
               <AlertTitle>Error al Cargar Horario</AlertTitle>
               <AlertDescription>{(errorViewableSchedule as Error).message || "No se pudo cargar el horario seleccionado."}</AlertDescription>
             </Alert>
          )}
          {!isLoadingViewableSchedule && !errorViewableSchedule && selectedServiceIdView && hasAttemptedInitialLoad && ( // Ensure initial load was attempted
            viewableSchedule ? (
              <>
                <InteractiveScheduleGrid
                  initialShifts={viewableSchedule.shifts}
                  allEmployees={employees}
                  targetService={selectedServiceForView}
                  month={selectedMonthView}
                  year={selectedYearView}
                  holidays={holidays}
                  isReadOnly={true}
                />
                <ScheduleEvaluationDisplay
                  score={viewableSchedule.score}
                  violations={viewableSchedule.violations}
                  scoreBreakdown={viewableSchedule.scoreBreakdown}
                  context="viewer"
                />
              </>
            ) : (
              <Alert>
                <Info className="h-5 w-5 mr-2"/>
                <AlertTitle>No se encontró un horario activo</AlertTitle>
                <AlertDescription>
                  No hay un horario activo para {selectedServiceForView?.name || 'el servicio seleccionado'} en {scheduleMonths.find(m => m.value === selectedMonthView)?.label || ''} {selectedYearView}.
                  Puede generar uno en la pestaña "Generar/Editar Horarios".
                </AlertDescription>
              </Alert>
            )
          )}
          {(!selectedServiceIdView || !hasAttemptedInitialLoad && !isLoadingViewableSchedule) && ( // Show this if no service or initial load not done
             <Alert variant="default">
                <Info className="h-5 w-5 mr-2"/>
                <AlertTitle>Seleccione Filtros y Cargue</AlertTitle>
                <AlertDescription>Por favor, elija un servicio, mes y año, y luego haga clic en "Cargar/Refrescar Horario" para ver el horario activo.</AlertDescription>
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
    </div>
  );
}
