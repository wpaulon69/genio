
"use client";

import type { Employee, Service } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FilePenLine, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

/**
 * Props para el componente `EmployeeList`.
 */
interface EmployeeListProps {
  /** Array de objetos `Employee` para mostrar en la lista. */
  employees: Employee[];
  /** Array de objetos `Service` disponibles, usado para mostrar nombres de servicios. */
  services: Service[];
  /** Función callback que se ejecuta cuando se hace clic en el botón de editar un empleado. */
  onEdit: (employee: Employee) => void;
  /** Función callback que se ejecuta cuando se hace clic en el botón de eliminar un empleado. */
  onDelete: (employeeId: string) => void;
  /** Indica si alguna operación (ej. eliminación) está en curso, para deshabilitar acciones. */
  isLoading?: boolean;
}

/**
 * `EmployeeList` es un componente que muestra una lista tabular de empleados.
 * Cada fila representa un empleado y muestra su nombre, contacto, roles y servicios asignados.
 * Proporciona acciones de edición y eliminación para cada empleado a través de un menú desplegable.
 *
 * @param {EmployeeListProps} props - Las props del componente.
 * @returns {JSX.Element} El elemento JSX que representa la lista de empleados.
 */
export default function EmployeeList({ employees, services, onEdit, onDelete, isLoading }: EmployeeListProps) {
  /**
   * Obtiene una cadena con los nombres de los servicios a partir de sus IDs.
   * @param {string[]} serviceIds - Array de IDs de servicios.
   * @returns {string} Una cadena con los nombres de los servicios separados por comas, o 'N/A'.
   */
  const getServiceNames = (serviceIds: string[]) => {
    if (!serviceIds || serviceIds.length === 0) return 'N/A';
    return serviceIds.map(id => services.find(s => s.id === id)?.name || 'Desconocido').join(', ');
  };

  /**
   * Obtiene las iniciales del nombre de un empleado.
   * @param {string} name - El nombre completo del empleado.
   * @returns {string} Las iniciales en mayúsculas.
   */
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
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden md:table-cell">Contacto</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="hidden lg:table-cell">Servicios</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={`https://placehold.co/40x40.png?text=${getInitials(employee.name)}`} alt={employee.name} data-ai-hint="retrato persona" />
                      <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                    </Avatar>
                    <div className="font-medium">{employee.name}</div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{employee.contact}</TableCell>
                <TableCell>
                  {employee.roles && employee.roles.map(role => <Badge key={role} variant="secondary" className="mr-1 mb-1">{role}</Badge>)}
                </TableCell>
                <TableCell className="hidden lg:table-cell">{getServiceNames(employee.serviceIds)}</TableCell>
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
                        <FilePenLine className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(employee.id)} className="text-destructive hover:!text-destructive-foreground hover:!bg-destructive" disabled={isLoading}>
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
  );
}
