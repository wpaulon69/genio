
"use client";

import PageHeader from '@/components/common/page-header';
import ScheduleView from '@/components/schedule/schedule-view';
import ShiftGeneratorForm from '@/components/schedule/shift-generator-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Shift, Employee, Service } from '@/lib/types';
import type { AIShift } from '@/ai/flows/suggest-shift-schedule';
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getShifts, addShift } from '@/lib/firebase/shifts';
import { getEmployees } from '@/lib/firebase/employees';
import { getServices } from '@/lib/firebase/services';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

export default function SchedulePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: shifts = [], isLoading: isLoadingShifts, error: errorShifts } = useQuery<Shift[]>({
    queryKey: ['shifts'],
    queryFn: getShifts,
  });
  const { data: employees = [], isLoading: isLoadingEmployees, error: errorEmployees } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: getEmployees,
  });
  const { data: services = [], isLoading: isLoadingServices, error: errorServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: getServices,
  });

  const addShiftMutation = useMutation({
    mutationFn: (newShift: Omit<Shift, 'id'>) => addShift(newShift),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      // Toast individual por turno guardado puede ser mucho, un resumen al final es mejor
    },
    onError: (err: Error, variables) => {
      console.error(`Error guardando turno para ${variables.employeeId} en ${variables.date}: ${err.message}`);
      // El toast de error individual también podría ser verboso.
    },
  });

  const handleSaveGeneratedShifts = async (aiShifts: AIShift[]): Promise<{ successCount: number; errorCount: number }> => {
    let successCount = 0;
    let errorCount = 0;

    toast({
      title: "Procesando Turnos...",
      description: `Intentando guardar ${aiShifts.length} turnos generados.`,
    });

    for (const aiShift of aiShifts) {
      const employee = employees.find(e => e.name.toLowerCase() === aiShift.employeeName.toLowerCase());
      const service = services.find(s => s.name.toLowerCase() === aiShift.serviceName.toLowerCase());

      if (!employee) {
        console.warn(`Empleado "${aiShift.employeeName}" no encontrado. Omitiendo turno.`);
        errorCount++;
        continue;
      }
      if (!service) {
        console.warn(`Servicio "${aiShift.serviceName}" no encontrado. Omitiendo turno.`);
        errorCount++;
        continue;
      }

      const newShift: Omit<Shift, 'id'> = {
        employeeId: employee.id,
        serviceId: service.id,
        date: aiShift.date, // Asegúrate que la IA devuelva YYYY-MM-DD
        startTime: aiShift.startTime, // Asegúrate que la IA devuelva HH:MM
        endTime: aiShift.endTime,   // Asegúrate que la IA devuelva HH:MM
        notes: aiShift.notes || `Generado por IA el ${new Date().toLocaleDateString()}`,
      };

      try {
        await addShiftMutation.mutateAsync(newShift);
        successCount++;
      } catch (e) {
        errorCount++;
        // El error ya se loguea en onError de la mutación
      }
    }

    if (successCount > 0) {
      toast({
        title: "Turnos Guardados",
        description: `${successCount} de ${aiShifts.length} turnos generados fueron guardados exitosamente.`,
      });
    }
    if (errorCount > 0) {
      toast({
        variant: "destructive",
        title: "Error al Guardar Turnos",
        description: `${errorCount} turnos no pudieron ser guardados. Revise la consola para más detalles (empleados/servicios no encontrados o errores de guardado).`,
        duration: 7000,
      });
    }
    if (successCount === 0 && errorCount === 0 && aiShifts.length > 0) {
        toast({
            variant: "default",
            title: "Sin cambios",
            description: "No se procesaron nuevos turnos para guardar.",
        });
    }
    
    queryClient.invalidateQueries({ queryKey: ['shifts'] }); // Invalida una vez después del lote
    return { successCount, errorCount };
  };


  const isLoading = isLoadingShifts || isLoadingEmployees || isLoadingServices;
  const error = errorShifts || errorEmployees || errorServices;

  if (isLoading) {
    return (
      <div className="container mx-auto flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto">
        <Alert variant="destructive">
          <AlertTitle>Error al Cargar Datos del Horario</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  // Prepara datos simplificados para el prompt del formulario
  const employeeNamesForPrompt = employees.map(e => ({id: e.id, name: e.name}));
  const serviceNamesForPrompt = services.map(s => ({id: s.id, name: s.name}));


  return (
    <div className="container mx-auto">
      <PageHeader
        title="Horario de Turnos"
        description="Vea los horarios actuales y genere nuevos usando IA. Los turnos generados se pueden guardar."
      />
      <Tabs defaultValue="view-schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-1/2">
          <TabsTrigger value="view-schedule">Ver Horario</TabsTrigger>
          <TabsTrigger value="generate-shifts">Generar Turnos</TabsTrigger>
        </TabsList>
        <TabsContent value="view-schedule" className="mt-6">
          <ScheduleView 
            shifts={shifts} 
            employees={employees} 
            services={services} 
          />
        </TabsContent>
        <TabsContent value="generate-shifts" className="mt-6">
          <ShiftGeneratorForm 
            onSaveShifts={handleSaveGeneratedShifts} 
            employeesAvailable={employeeNamesForPrompt}
            servicesAvailable={serviceNamesForPrompt}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
