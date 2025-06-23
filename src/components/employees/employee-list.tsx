"use client";

import type { Employee, Service, TipoAsignacion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FilePenLine, Trash2, Loader2, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import React, { useState } from 'react';
import EmployeePreferencesForm from './employee-preferences-form';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface EmployeeListProps {
  employees: Employee[];
  services: Service[];
  assignmentTypes: TipoAsignacion[];
  onEdit: (employee: Employee) => void;
  onDelete: (employeeId: number) => void;
  onUpdatePreferences: (employeeId: number, preferences: any) => void;
  isLoading?: boolean;
}

export default function EmployeeList({ employees, services, assignmentTypes, onEdit, onDelete, onUpdatePreferences, isLoading }: EmployeeListProps) {
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const handleOpenPreferences = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsPreferencesModalOpen(true);
  };

  const handleClosePreferences = () => {
    setIsPreferencesModalOpen(false);
    setSelectedEmployee(null);
  };

  const handlePreferencesSubmit = (data: any) => {
    if (selectedEmployee) {
      onUpdatePreferences(selectedEmployee.id_empleado, data);
      handleClosePreferences();
    }
  };

  const getServiceName = (serviceId: number) => {
    return services.find(s => s.id_servicio === serviceId)?.nombre_servicio || 'Desconocido';
  };

  const getInitials = (name: string) => {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  if (employees.length === 0) {
    return (
      <Card className="text-center">
        <CardHeader>
          <CardTitle>No Se Encontraron Empleados</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Aún no se han definido empleados. Haga clic en "Añadir Nuevo Empleado" para comenzar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden md:table-cell">Contacto</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id_empleado}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={`https://placehold.co/40x40.png?text=${getInitials(employee.nombre)}`} alt={employee.nombre} data-ai-hint="retrato persona" />
                      <AvatarFallback>{getInitials(employee.nombre)}</AvatarFallback>
                    </Avatar>
                    <div className="font-medium">{employee.nombre}</div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{employee.email_empleado}</TableCell>
                <TableCell>{getServiceName(employee.id_servicio)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {!isLoading && <MoreHorizontal className="h-4 w-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(employee)} disabled={isLoading}>
                        <FilePenLine className="mr-2 h-4 w-4" /> Editar Datos
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenPreferences(employee)} disabled={isLoading}>
                        <Settings className="mr-2 h-4 w-4" /> Preferencias
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(employee.id_empleado)} className="text-destructive hover:!text-destructive-foreground hover:!bg-destructive" disabled={isLoading}>
                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    {selectedEmployee && (
        <EmployeePreferencesForm
          isOpen={isPreferencesModalOpen}
          onClose={handleClosePreferences}
          onSubmit={handlePreferencesSubmit}
          employee={selectedEmployee}
          availableAssignmentTypes={assignmentTypes}
          isLoading={isLoading}
        />
      )}
    </>
  );
}
