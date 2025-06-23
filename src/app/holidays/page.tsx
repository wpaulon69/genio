"use client";

import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2, AlertTriangle } from 'lucide-react';
import HolidayList from '@/components/holidays/holiday-list';
import HolidayForm from '@/components/holidays/holiday-form';
import type { Holiday } from '@/lib/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface HolidayPageProps {}

export default function HolidaysPage({}: HolidayPageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);

  const { data: holidays = [], isLoading, error } = useQuery<Holiday[]>({
    queryKey: ['holidays'],
    queryFn: async () => {
      const response = await fetch('/api/holidays');
      if (!response.ok) throw new Error('Failed to fetch holidays');
      return response.json();
    },
  });

  const addHolidayMutation = useMutation({
    mutationFn: async (newHoliday: Omit<Holiday, 'id'>) => {
      const response = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHoliday),
      });
      if (!response.ok) throw new Error('Failed to add holiday');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast({ title: "Feriado Añadido", description: "El nuevo feriado ha sido añadido exitosamente." });
      setIsFormOpen(false);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo añadir el feriado: ${err.message}` });
    },
  });

  const updateHolidayMutation = useMutation({
    mutationFn: async (holiday: Holiday) => {
      const response = await fetch('/api/holidays', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holiday),
      });
      if (!response.ok) throw new Error('Failed to update holiday');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast({ title: "Feriado Actualizado", description: "El feriado ha sido actualizado exitosamente." });
      setIsFormOpen(false);
      setEditingHoliday(null);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo actualizar el feriado: ${err.message}` });
    },
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: async (holidayId: number) => {
      const response = await fetch(`/api/holidays?id=${holidayId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete holiday');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast({ title: "Feriado Eliminado", description: "El feriado ha sido eliminado exitosamente." });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo eliminar el feriado: ${err.message}` });
    },
  });

  const handleFormSubmit = (holidayData: Omit<Holiday, 'id'> | Holiday) => {
    if (editingHoliday && 'id' in holidayData) {
      updateHolidayMutation.mutate(holidayData as Holiday);
    } else {
      addHolidayMutation.mutate(holidayData as Omit<Holiday, 'id'>);
    }
  };

  const handleEditHoliday = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setIsFormOpen(true);
  };

  const handleDeleteHoliday = (holidayId: number) => {
    // Consider adding a confirmation dialog here
    deleteHolidayMutation.mutate(holidayId);
  };

  const openFormForNew = () => {
    setEditingHoliday(null);
    setIsFormOpen(true);
  };

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
          <AlertTriangle className="h-5 w-5 mr-2" />
          <AlertTitle>Error al Cargar Feriados</AlertTitle>
          <AlertDescription>{error?.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Administrar Feriados"
        description="Defina y organice los días feriados para la planificación de turnos."
        actions={(
          <Button onClick={openFormForNew} disabled={addHolidayMutation.isPending || updateHolidayMutation.isPending}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nuevo Feriado
          </Button>
        )}
      />
      <HolidayList
        holidays={holidays}
        onEdit={handleEditHoliday}
        onDelete={handleDeleteHoliday}
        isLoading={deleteHolidayMutation.isPending}
      />
      <HolidayForm
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingHoliday(null); }}
        onSubmit={handleFormSubmit}
        holiday={editingHoliday}
        isLoading={addHolidayMutation.isPending || updateHolidayMutation.isPending}
      />
    </div>
  );
}
