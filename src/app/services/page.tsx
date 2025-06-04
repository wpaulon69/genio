
"use client";

import React, { useState } from 'react';
import PageHeader from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2 } from 'lucide-react';
import ServiceList from '@/components/services/service-list';
import ServiceForm from '@/components/services/service-form';
import type { Service } from '@/lib/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getServices, addService, updateService, deleteService } from '@/lib/firebase/services';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ServicesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const { data: services = [], isLoading, error } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: getServices,
  });

  const addServiceMutation = useMutation({
    mutationFn: (newService: Omit<Service, 'id'>) => addService(newService),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      toast({ title: "Servicio Añadido", description: "El nuevo servicio ha sido añadido exitosamente." });
      setIsFormOpen(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo añadir el servicio: ${err.message}` });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: ({ id, ...data }: Service) => updateService(id, data),
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

  const deleteServiceMutation = useMutation({
    mutationFn: (serviceId: string) => deleteService(serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      toast({ title: "Servicio Eliminado", description: "El servicio ha sido eliminado exitosamente." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo eliminar el servicio: ${err.message}` });
    },
  });

  const handleFormSubmit = (serviceData: Service) => {
    // serviceData comes from ServiceForm, it includes an ID (empty if new)
    if (editingService) {
      updateServiceMutation.mutate({ ...serviceData, id: editingService.id }); // Ensure correct ID
    } else {
      const { id, ...newServiceData } = serviceData; // Remove ID for creation
      addServiceMutation.mutate(newServiceData);
    }
  };

  const handleEditService = (service: Service) => {
    setEditingService(service);
    setIsFormOpen(true);
  };

  const handleDeleteService = (serviceId: string) => {
    // Optional: Add confirmation dialog here
    deleteServiceMutation.mutate(serviceId);
  };

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
