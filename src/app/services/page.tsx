"use client";

import React, { useState } from 'react';
import PageHeader from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import ServiceList from '@/components/services/service-list';
import ServiceForm from '@/components/services/service-form';
import type { Service } from '@/lib/types';
import { mockServices } from '@/lib/types'; // Using mock data

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>(mockServices);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const handleAddService = (service: Service) => {
    if (editingService) {
      setServices(services.map(s => s.id === service.id ? service : s));
    } else {
      setServices([...services, { ...service, id: `s${services.length + 1}` }]);
    }
    setEditingService(null);
  };

  const handleEditService = (service: Service) => {
    setEditingService(service);
    setIsFormOpen(true);
  };

  const handleDeleteService = (serviceId: string) => {
    setServices(services.filter(s => s.id !== serviceId));
  };

  const openFormForNew = () => {
    setEditingService(null);
    setIsFormOpen(true);
  };

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Administrar Servicios"
        description="Defina y organice los servicios, reglas y requisitos del hospital."
        actions={
          <Button onClick={openFormForNew}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nuevo Servicio
          </Button>
        }
      />
      <ServiceList
        services={services}
        onEdit={handleEditService}
        onDelete={handleDeleteService}
      />
      <ServiceForm
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingService(null); }}
        onSubmit={handleAddService}
        service={editingService}
      />
    </div>
  );
}
