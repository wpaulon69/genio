
"use client";

import React, { useState } from 'react';
import PageHeader from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2 } from 'lucide-react';
import ServiceList from '@/components/services/service-list';
import ServiceForm from '@/components/services/service-form';
import type { Service } from '@/lib/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * `ServicesPage` es el componente de página para administrar los servicios del hospital.
 * Permite a los usuarios ver una lista de servicios existentes, añadir nuevos servicios,
 * editar los existentes y eliminarlos.
 *
 * Utiliza `TanStack Query (React Query)` para la obtención y mutación de datos de servicios,
 * interactuando con las funciones definidas en `src/lib/mysql/services.ts`.
 * Muestra un formulario modal (`ServiceForm`) para la creación y edición de servicios.
 * Muestra notificaciones (`Toast`) para las acciones realizadas.
 *
 * @returns {JSX.Element} El elemento JSX que representa la página de gestión de servicios.
 */
export default function ServicesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  /** Estado para controlar la visibilidad del formulario de servicio. */
  const [isFormOpen, setIsFormOpen] = useState(false);
  /** Estado para almacenar el servicio que se está editando (o `null` si es un nuevo servicio). */
  const [editingService, setEditingService] = useState<Service | null>(null);

  /**
   * Consulta para obtener la lista de servicios.
   * @property {Service[]} data - Array de servicios (valor por defecto: []).
   * @property {boolean} isLoading - Indica si la consulta está cargando.
   * @property {Error | null} error - Objeto de error si la consulta falla.
   */
  const { data: services = [], isLoading, error } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => {
      const response = await fetch('/api/services');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
  });

  /** Mutación para añadir un nuevo servicio. */
  const addServiceMutation = useMutation({
    mutationFn: async (newService: Omit<Service, 'id_servicio'>) => {
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newService),
      });
      if (!response.ok) {
        throw new Error('Failed to create service');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      toast({ title: "Servicio Añadido", description: "El nuevo servicio ha sido añadido exitosamente." });
      setIsFormOpen(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo añadir el servicio: ${err.message}` });
    },
  });

  /** Mutación para actualizar un servicio existente. */
  const updateServiceMutation = useMutation({
    mutationFn: async (service: Service) => {
      const response = await fetch('/api/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(service),
      });
      if (!response.ok) {
        throw new Error('Failed to update service');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      toast({ title: "Servicio Actualizado", description: "El servicio ha sido actualizado exitosamente." });
      setIsFormOpen(false);
      setEditingService(null);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo actualizar el servicio: ${err.message}` });
    },
  });

  /** Mutación para eliminar un servicio. */
  const deleteServiceMutation = useMutation({
    mutationFn: async (serviceId: number) => {
      const response = await fetch(`/api/services?id=${serviceId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete service');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      toast({ title: "Servicio Eliminado", description: "El servicio ha sido eliminado exitosamente." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo eliminar el servicio: ${err.message}` });
    },
  });

  /**
   * Manejador para el envío del formulario de servicio.
   * Llama a la mutación de añadir o actualizar según si `editingService` está definido.
   * @param {Service} serviceData - Datos del servicio del formulario.
   */
  const handleFormSubmit = (serviceData: Service) => {
    if (serviceData.id_servicio) {
      updateServiceMutation.mutate(serviceData);
    } else {
      const { id_servicio, ...newServiceData } = serviceData;
      addServiceMutation.mutate(newServiceData);
    }
  };

  /**
   * Prepara el formulario para editar un servicio existente.
   * @param {Service} service - El servicio a editar.
   */
  const handleEditService = (service: Service) => {
    setEditingService(service);
    setIsFormOpen(true);
  };

  /**
   * Manejador para eliminar un servicio.
   * Llama a la mutación de eliminación.
   * @param {number} serviceId - ID del servicio a eliminar.
   */
  const handleDeleteService = (serviceId: number) => {
    // Opcional: Añadir diálogo de confirmación aquí.
    deleteServiceMutation.mutate(serviceId);
  };

  /**
   * Abre el formulario para añadir un nuevo servicio.
   */
  const openFormForNew = () => {
    setEditingService(null);
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
          <AlertTitle>Error al Cargar Servicios</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Administrar Servicios"
        description="Defina y organice los servicios, reglas y requisitos del hospital."
        actions={
          <Button onClick={openFormForNew} disabled={addServiceMutation.isPending || updateServiceMutation.isPending}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nuevo Servicio
          </Button>
        }
      />
      <ServiceList
        services={services}
        onEdit={handleEditService}
        onDelete={handleDeleteService}
        isLoading={deleteServiceMutation.isPending}
      />
      <ServiceForm
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingService(null); }}
        onSubmit={handleFormSubmit}
        service={editingService}
        isLoading={addServiceMutation.isPending || updateServiceMutation.isPending}
      />
    </div>
  );
}
