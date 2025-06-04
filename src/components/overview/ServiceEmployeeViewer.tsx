
"use client";

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getServices } from '@/lib/firebase/services';
import { getEmployees } from '@/lib/firebase/employees';
import type { Service, Employee } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const getInitials = (name: string) => {
  if (!name) return '';
  return name.split(' ').map(n => n[0]).join('').toUpperCase();
};

export default function ServiceEmployeeViewer() {
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(undefined);

  const { data: services = [], isLoading: isLoadingServices, error: errorServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: getServices,
  });

  const { data: employees = [], isLoading: isLoadingEmployees, error: errorEmployees } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: getEmployees,
  });

  const selectedService = useMemo(() => {
    return services.find(service => service.id === selectedServiceId);
  }, [services, selectedServiceId]);

  const assignedEmployees = useMemo(() => {
    if (!selectedServiceId || employees.length === 0) {
      return [];
    }
    return employees.filter(employee => employee.serviceIds.includes(selectedServiceId));
  }, [selectedServiceId, employees]);

  const isLoading = isLoadingServices || isLoadingEmployees;
  const queryError = errorServices || errorEmployees;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (queryError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error al Cargar Datos</AlertTitle>
        <AlertDescription>{queryError.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visor de Empleados por Servicio</CardTitle>
        <CardDescription>Seleccione un servicio para ver los empleados asignados.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="w-full md:w-1/2">
          <Select onValueChange={setSelectedServiceId} value={selectedServiceId}>
            <SelectTrigger id="service-select">
              <SelectValue placeholder="Seleccione un servicio..." />
            </SelectTrigger>
            <SelectContent>
              {services.length > 0 ? (
                services.map(service => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name}
                  </SelectItem>
                ))
              ) : (
                <div className="p-4 text-sm text-muted-foreground">No hay servicios disponibles.</div>
              )}
            </SelectContent>
          </Select>
        </div>

        {selectedServiceId && selectedService && (
          <div>
            <h3 className="text-xl font-semibold mb-3">
              Empleados en: <span className="text-primary">{selectedService.name}</span>
            </h3>
            {assignedEmployees.length > 0 ? (
              <ul className="space-y-4">
                {assignedEmployees.map(employee => (
                  <li key={employee.id} className="flex items-center gap-4 p-3 border rounded-lg shadow-sm hover:bg-muted/50 transition-colors">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={`https://placehold.co/48x48.png?text=${getInitials(employee.name)}`} alt={employee.name} data-ai-hint="retrato persona" />
                      <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-grow">
                      <p className="font-medium text-base">{employee.name}</p>
                      <div className="text-sm text-muted-foreground">
                        {employee.roles && employee.roles.length > 0 ? (
                          employee.roles.map(role => (
                            <Badge key={role} variant="secondary" className="mr-1 mb-1">{role}</Badge>
                          ))
                        ) : (
                          <span>Sin roles definidos</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Alert>
                <Users className="h-4 w-4" />
                <AlertTitle>No Hay Empleados Asignados</AlertTitle>
                <AlertDescription>
                  Actualmente no hay empleados asignados al servicio de "{selectedService.name}".
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
        {!selectedServiceId && services.length > 0 && (
           <Alert variant="default" className="mt-4">
            <Users className="h-4 w-4" />
            <AlertTitle>Seleccione un Servicio</AlertTitle>
            <AlertDescription>
              Por favor, elija un servicio del menú desplegable para ver los empleados asignados.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
