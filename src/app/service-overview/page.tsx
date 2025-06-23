
"use client";

import React from 'react';
import PageHeader from '@/components/common/page-header';
import ServiceEmployeeViewer from '@/components/overview/ServiceEmployeeViewer'; // Asumiendo esta ruta para el nuevo componente

export default function ServiceOverviewPage() {
  return (
    <div className="container mx-auto">
      <PageHeader
        title="Personal por Servicio"
        description="Seleccione un servicio para ver los empleados asignados y sus roles."
      />
      <ServiceEmployeeViewer />
    </div>
  );
}
