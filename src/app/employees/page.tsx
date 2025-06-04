
"use client";

import React, { useState } from 'react';
import PageHeader from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle, Loader2 } from 'lucide-react';
import EmployeeList from '@/components/employees/employee-list';
import EmployeeForm from '@/components/employees/employee-form';
import type { Employee, Service } from '@/lib/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEmployees, addEmployee, updateEmployee, deleteEmployee } from '@/lib/firebase/employees';
import { getServices } from '@/lib/firebase/services';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const { data: employees = [], isLoading: isLoadingEmployees, error: errorEmployees } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: getEmployees,
  });

  const { data: services = [], isLoading: isLoadingServices, error: errorServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: getServices,
  });

  const addEmployeeMutation = useMutation({
    mutationFn: (newEmployee: Omit<Employee, 'id'>) => addEmployee(newEmployee),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: "Empleado Añadido", description: "El nuevo empleado ha sido añadido exitosamente." });
      setIsFormOpen(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo añadir el empleado: ${err.message}` });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: ({ id, ...data }: Employee) => updateEmployee(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: "Empleado Actualizado", description: "El empleado ha sido actualizado exitosamente." });
      setIsFormOpen(false);
      setEditingEmployee(null);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo actualizar el empleado: ${err.message}` });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: (employeeId: string) => deleteEmployee(employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: "Empleado Eliminado", description: "El empleado ha sido eliminado exitosamente." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Error", description: `No se pudo eliminar el empleado: ${err.message}` });
    },
  });

  const handleFormSubmit = (employeeData: Employee) => {
    if (editingEmployee) {
      updateEmployeeMutation.mutate({ ...employeeData, id: editingEmployee.id });
    } else {
      const { id, ...newEmployeeData } = employeeData;
      addEmployeeMutation.mutate(newEmployeeData);
    }
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsFormOpen(true);
  };

  const handleDeleteEmployee = (employeeId: string) => {
    deleteEmployeeMutation.mutate(employeeId);
  };
  
  const openFormForNew = () => {
    setEditingEmployee(null);
    setIsFormOpen(true);
  };

  const isLoading = isLoadingEmployees || isLoadingServices;
  const error = errorEmployees || errorServices;

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
        actions={
          <Button onClick={openFormForNew} disabled={addEmployeeMutation.isPending || updateEmployeeMutation.isPending}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nuevo Empleado
          </Button>
        }
      />
      <EmployeeList
        employees={employees}
        services={services}
        onEdit={handleEditEmployee}
        onDelete={handleDeleteEmployee}
        isLoading={deleteEmployeeMutation.isPending}
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
