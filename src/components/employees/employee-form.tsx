
"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Employee, Service } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';

const employeeSchema = z.object({
  name: z.string().min(1, "El nombre del empleado es obligatorio"),
  contact: z.string().email("Dirección de correo electrónico inválida").or(z.string().min(10, "El número de teléfono parece demasiado corto")),
  serviceIds: z.array(z.string()).min(1, "Se debe seleccionar al menos un servicio"),
  roles: z.string().min(1, "Los roles son obligatorios (separados por coma)").transform(val => val.split(',').map(s => s.trim()).filter(Boolean)),
  preferences: z.string().optional(),
  availability: z.string().optional(),
  constraints: z.string().optional(),
});

// For the form, roles are a string, but for Employee type, roles are string[]
type EmployeeFormInput = Omit<z.infer<typeof employeeSchema>, 'roles'> & { roles: string };

interface EmployeeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (employee: Employee) => void; // Expects full Employee object with ID (empty if new)
  employee?: Employee | null;
  availableServices: Service[];
  isLoading?: boolean;
}

export default function EmployeeForm({ isOpen, onClose, onSubmit, employee, availableServices, isLoading }: EmployeeFormProps) {
  const form = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeSchema.extend({ roles: z.string() })),
    defaultValues: {
      name: '',
      contact: '',
      serviceIds: [],
      roles: '',
      preferences: '',
      availability: '',
      constraints: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (employee) {
        form.reset({
          name: employee.name,
          contact: employee.contact,
          serviceIds: employee.serviceIds || [],
          roles: employee.roles ? employee.roles.join(', ') : '',
          preferences: employee.preferences || '',
          availability: employee.availability || '',
          constraints: employee.constraints || '',
        });
      } else {
        form.reset({
          name: '',
          contact: '',
          serviceIds: [],
          roles: '',
          preferences: '',
          availability: '',
          constraints: '',
        });
      }
    }
  }, [employee, form, isOpen]);

  const handleSubmit = (data: EmployeeFormInput) => {
    const processedData = {
      ...data,
      roles: data.roles.split(',').map(s => s.trim()).filter(Boolean),
    };
    onSubmit({
      id: employee?.id || '', 
      ...processedData,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar Empleado' : 'Añadir Nuevo Empleado'}</DialogTitle>
          <DialogDescription>
            {employee ? 'Actualice los detalles del empleado.' : 'Complete los detalles para el nuevo empleado.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
            <ScrollArea className="max-h-[70vh] pr-4 -mr-2 py-2"> {/* Added ScrollArea */}
              <div className="space-y-3">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nombre Completo</FormLabel><FormControl><Input placeholder="ej., Dr. Juan Pérez" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="contact" render={({ field }) => (
                  <FormItem><FormLabel>Contacto (Email/Teléfono)</FormLabel><FormControl><Input placeholder="juan.perez@hospital.com o 555-1234" {...field} disabled={isLoading}/></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="roles" render={({ field }) => (
                  <FormItem><FormLabel>Roles (separados por coma)</FormLabel><FormControl><Input placeholder="ej., Enfermero, Cirujano" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField
                  control={form.control}
                  name="serviceIds"
                  render={() => (
                    <FormItem>
                      <FormLabel>Servicios Asignables</FormLabel>
                      {availableServices.length === 0 && <p className="text-sm text-muted-foreground">No hay servicios disponibles. Por favor, añada servicios primero.</p>}
                      {availableServices.map((service) => (
                        <FormField
                          key={service.id}
                          control={form.control}
                          name="serviceIds"
                          render={({ field }) => {
                            return (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 my-2">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(service.id)}
                                    onCheckedChange={(checked) => {
                                      const newValue = checked
                                        ? [...(field.value || []), service.id]
                                        : (field.value || []).filter(
                                            (value) => value !== service.id
                                          );
                                      field.onChange(newValue);
                                    }}
                                    disabled={isLoading}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal">
                                  {service.name}
                                </FormLabel>
                              </FormItem>
                            );
                          }}
                        />
                      ))}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="preferences" render={({ field }) => (
                  <FormItem><FormLabel>Preferencias</FormLabel><FormControl><Textarea placeholder="ej., Prefiere turnos de mañana" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="availability" render={({ field }) => (
                  <FormItem><FormLabel>Disponibilidad</FormLabel><FormControl><Textarea placeholder="ej., Lun-Vie, no disponible en festivos" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="constraints" render={({ field }) => (
                  <FormItem><FormLabel>Restricciones</FormLabel><FormControl><Textarea placeholder="ej., Máx 40 horas/semana" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </ScrollArea>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {employee ? 'Guardar Cambios' : 'Crear Empleado'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
