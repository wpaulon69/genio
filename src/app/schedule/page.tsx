
"use client";

import PageHeader from '@/components/common/page-header';
import ScheduleView from '@/components/schedule/schedule-view';
import ShiftGeneratorForm from '@/components/schedule/shift-generator-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Shift, Employee, Service } from '@/lib/types';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getShifts } from '@/lib/firebase/shifts';
import { getEmployees } from '@/lib/firebase/employees';
import { getServices } from '@/lib/firebase/services';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';


export default function SchedulePage() {
  const { toast } = useToast();

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


  const handleScheduleGenerated = (generatedScheduleText: string) => {
    // This is a simplified handler. In a real app, you would parse
    // the generatedScheduleText and potentially save new shifts to Firestore.
    // This would involve a mutation and then invalidating the 'shifts' query.
    console.log("Horario Generado:", generatedScheduleText);
    toast({
      title: "Horario Sugerido Generado",
      description: "El horario ha sido generado. Revise la consola y el área de texto. La funcionalidad para guardar este horario aún no está implementada.",
      duration: 5000,
    });
    // For now, we just alert.
    // alert("¡Horario generado! Revise la consola. (El análisis y la visualización aún no están implementados)");
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

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Horario de Turnos"
        description="Vea los horarios actuales y genere nuevos usando IA."
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
          <ShiftGeneratorForm onScheduleGenerated={handleScheduleGenerated} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
