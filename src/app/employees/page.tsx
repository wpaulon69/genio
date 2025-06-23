"use client";

import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2, AlertTriangle } from 'lucide-react';
import EmployeeList from '@/components/employees/employee-list';
import EmployeeForm from '@/components/employees/employee-form';
import type { Employee, Service, TipoAsignacion } from '@/lib/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EmployeesPageProps {}

export default function EmployeesPage({}: EmployeesPageProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const { data: employees = [], isLoading: isLoadingEmployees, error: errorEmployees } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => {
      const response = await fetch('/api/employees');
      if (!response.ok) throw new Error('Failed to fetch employees');
      return response.json();
    },
  });

  const { data: services = [], isLoading: isLoadingServices, error: errorServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => {
      const response = await fetch('/api/services');
      if (!response.ok) throw new Error('Failed to fetch services');
      return response.json();
    },
  });

  const { data: assignmentTypes = [], isLoading: isLoadingAssignmentTypes, error: errorAssignmentTypes } = useQuery<TipoAsignacion[]>({
    queryKey: ['assignmentTypes'],
    queryFn: async () => {
      // Suponiendo que crearás este endpoint
      const response = await fetch('/api/assignment-types');
      if (!response.ok) throw new Error('Failed to fetch assignment types');
      return response.json();
    },
  });

  const addEmployeeMutation = useMutation({
    mutationFn: async (newEmployee: Omit<Employee, 'id_empleado'>) => {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee),
      });
      if (!response.ok) throw new Error('Failed to add employee');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: "Empleado Añadido", description: "El nuevo empleado ha sido añadido exitosamente." });
      setIsFormOpen(false);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo añadir el empleado: ${err.message}` });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async (employee: Employee) => {
      const response = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employee),
      });
      if (!response.ok) throw new Error('Failed to update employee');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: "Empleado Actualizado", description: "El empleado ha sido actualizado exitosamente." });
      setIsFormOpen(false);
      setEditingEmployee(null);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo actualizar el empleado: ${err.message}` });
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async ({ employeeId, preferences }: { employeeId: number, preferences: any }) => {
      const response = await fetch('/api/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_empleado: employeeId, ...preferences }),
      });
      if (!response.ok) throw new Error('Failed to update preferences');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: "Preferencias Actualizadas", description: "Las preferencias del empleado han sido guardadas." });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudieron guardar las preferencias: ${err.message}` });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (employeeId: number) => {
      const response = await fetch(`/api/employees?id=${employeeId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete employee');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: "Empleado Eliminado", description: "El empleado ha sido eliminado exitosamente." });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo eliminar el empleado: ${err.message}` });
    },
  });

  const handleFormSubmit = (employeeData: Omit<Employee, 'id_empleado'> | Employee) => {
    if ('id_empleado' in employeeData && employeeData.id_empleado) {
      updateEmployeeMutation.mutate(employeeData as Employee);
    } else {
      addEmployeeMutation.mutate(employeeData as Omit<Employee, 'id_empleado'>);
    }
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsFormOpen(true);
  };

  const handleDeleteEmployee = (employeeId: number) => {
    deleteEmployeeMutation.mutate(employeeId);
  };

  const handleUpdatePreferences = (employeeId: number, preferences: any) => {
    const originalEmployee = employees.find(e => e.id_empleado === employeeId);
    if (originalEmployee) {
      const updatedEmployee = { ...originalEmployee, ...preferences };
      updateEmployeeMutation.mutate(updatedEmployee);
    }
  };
  
  const openFormForNew = () => {
    setEditingEmployee(null);
    setIsFormOpen(true);
  };

  const isLoadingData = isLoadingEmployees || isLoadingServices;
  const hasError = errorEmployees || errorServices;

  if (isLoadingData) {
    return (
      <div className="container mx-auto flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="container mx-auto">
        <Alert variant="destructive">
          <AlertTitle>Error al Cargar Datos</AlertTitle>
          <AlertDescription>{(errorEmployees?.message || errorServices?.message)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Administrar Empleados"
        description="Mantenga un directorio del personal del hospital, sus roles y preferencias."
        actions={(
          <Button onClick={openFormForNew} disabled={addEmployeeMutation.isPending || updateEmployeeMutation.isPending}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nuevo Empleado
          </Button>
        )}
      />
      <EmployeeList
        employees={employees}
        services={services}
        assignmentTypes={assignmentTypes}
        onEdit={handleEditEmployee}
        onDelete={handleDeleteEmployee}
        onUpdatePreferences={handleUpdatePreferences}
        isLoading={deleteEmployeeMutation.isPending || updatePreferencesMutation.isPending}
      />
      <EmployeeForm
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingEmployee(null); }}
        onSubmit={handleFormSubmit}
        employee={editingEmployee}
        availableServices={services}
        isLoading={addEmployeeMutation.isPending || updateEmployeeMutation.isPending}
      />
    </div>
  );
}
