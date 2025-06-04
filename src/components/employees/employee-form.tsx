
"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import type { Employee, Service, EmployeePreferences } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const preferencesSchema = z.object({
  eligibleForDayOffAfterDuty: z.boolean().optional(),
  prefersWeekendWork: z.boolean().optional(),
  fixedWeeklyShiftDays: z.array(z.string()).optional(),
  fixedWeeklyShiftTiming: z.string().optional().or(z.literal("")), // Allow empty string for "Ninguno"
});

const employeeSchema = z.object({
  name: z.string().min(1, "El nombre del empleado es obligatorio"),
  contact: z.string().email("Dirección de correo electrónico inválida").or(z.string().min(10, "El número de teléfono parece demasiado corto")),
  serviceIds: z.array(z.string()).min(1, "Se debe seleccionar al menos un servicio"),
  roles: z.string().min(1, "Los roles son obligatorios (separados por coma)").transform(val => val.split(',').map(s => s.trim()).filter(Boolean)),
  preferences: preferencesSchema.optional(),
  availability: z.string().optional(),
  constraints: z.string().optional(),
});

type EmployeeFormInput = Omit<z.infer<typeof employeeSchema>, 'roles'> & { roles: string };

interface EmployeeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (employee: Employee) => void;
  employee?: Employee | null;
  availableServices: Service[];
  isLoading?: boolean;
}

const daysOfWeek = [
  { id: 'lunes', label: 'Lunes' },
  { id: 'martes', label: 'Martes' },
  { id: 'miercoles', label: 'Miércoles' },
  { id: 'jueves', label: 'Jueves' },
  { id: 'viernes', label: 'Viernes' },
  { id: 'sabado', label: 'Sábado' },
  { id: 'domingo', label: 'Domingo' },
];

const shiftTimings = [
  { value: "", label: "Ninguno" },
  { value: "mañana", label: "Mañana (ej. 07:00-15:00)" },
  { value: "tarde", label: "Tarde (ej. 15:00-23:00)" },
  { value: "noche", label: "Noche (ej. 23:00-07:00)" },
];

const defaultPreferences: EmployeePreferences = {
  eligibleForDayOffAfterDuty: false,
  prefersWeekendWork: false,
  fixedWeeklyShiftDays: [],
  fixedWeeklyShiftTiming: "",
};

export default function EmployeeForm({ isOpen, onClose, onSubmit, employee, availableServices, isLoading }: EmployeeFormProps) {
  const form = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeSchema.extend({ roles: z.string() })),
    defaultValues: {
      name: '',
      contact: '',
      serviceIds: [],
      roles: '',
      preferences: { ...defaultPreferences },
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
          preferences: {
            ...defaultPreferences, // Start with defaults
            ...(employee.preferences || {}), // Override with employee specific preferences
          },
          availability: employee.availability || '',
          constraints: employee.constraints || '',
        });
      } else {
        form.reset({
          name: '',
          contact: '',
          serviceIds: [],
          roles: '',
          preferences: { ...defaultPreferences },
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
      preferences: data.preferences ? {
        ...data.preferences,
        fixedWeeklyShiftTiming: data.preferences.fixedWeeklyShiftTiming === "" ? undefined : data.preferences.fixedWeeklyShiftTiming,
        // Ensure fixedWeeklyShiftDays is an empty array if no days are selected, not undefined
        fixedWeeklyShiftDays: data.preferences.fixedWeeklyShiftDays || []
      } : undefined,
    };
    onSubmit({
      id: employee?.id || '',
      ...processedData,
    });
  };

  const handleClearFixedShift = () => {
    form.setValue('preferences.fixedWeeklyShiftDays', [], { shouldValidate: true });
    form.setValue('preferences.fixedWeeklyShiftTiming', "", { shouldValidate: true });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar Empleado' : 'Añadir Nuevo Empleado'}</DialogTitle>
          <DialogDescription>
            {employee ? 'Actualice los detalles del empleado.' : 'Complete los detalles para el nuevo empleado.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
            <ScrollArea className="max-h-[70vh] pr-4 -mr-2 py-2">
              <div className="space-y-4">
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
                      <div className="grid grid-cols-2 gap-2">
                        {availableServices.map((service) => (
                          <FormField
                            key={service.id}
                            control={form.control}
                            name="serviceIds"
                            render={({ field }) => {
                              return (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 my-1 p-2 border rounded-md hover:bg-muted/50">
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
                                  <FormLabel className="font-normal text-sm">
                                    {service.name}
                                  </FormLabel>
                                </FormItem>
                              );
                            }}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Separator className="my-4" />
                <h3 className="text-md font-semibold">Preferencias Adicionales</h3>

                <FormField control={form.control} name="preferences.eligibleForDayOffAfterDuty" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLoading} /></FormControl>
                    <FormLabel className="font-normal">¿Elegible para Franco Después de Guardia (D/D)?</FormLabel>
                  </FormItem>
                )} />
                
                <FormField control={form.control} name="preferences.prefersWeekendWork" render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLoading} /></FormControl>
                    <FormLabel className="font-normal">Prefiere Trabajar Fines de Semana</FormLabel>
                  </FormItem>
                )} />

                <Separator className="my-4" />
                <h3 className="text-md font-semibold">Turno Fijo Semanal (Opcional)</h3>
                 <FormItem>
                  <FormLabel>Días de la Semana</FormLabel>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {daysOfWeek.map((day) => (
                    <FormField
                      key={day.id}
                      control={form.control}
                      name="preferences.fixedWeeklyShiftDays"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2 space-y-0 p-2 border rounded-md hover:bg-muted/50">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(day.id)}
                              onCheckedChange={(checked) => {
                                const currentDays = field.value || [];
                                const newValue = checked
                                  ? [...currentDays, day.id]
                                  : currentDays.filter((value) => value !== day.id);
                                field.onChange(newValue);
                              }}
                              disabled={isLoading}
                            />
                          </FormControl>
                          <FormLabel className="font-normal text-sm">{day.label}</FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                  </div>
                  <FormMessage />
                </FormItem>

                <FormField
                  control={form.control}
                  name="preferences.fixedWeeklyShiftTiming"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horario del Turno Fijo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""} disabled={isLoading}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar horario" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {shiftTimings.map(timing => (
                            <SelectItem key={timing.value} value={timing.value}>
                              {timing.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleClearFixedShift} disabled={isLoading}>
                  Limpiar Turno Fijo
                </Button>

                <Separator className="my-4" />
                <h3 className="text-md font-semibold">Otros Detalles</h3>

                <FormField control={form.control} name="availability" render={({ field }) => (
                  <FormItem><FormLabel>Disponibilidad General</FormLabel><FormControl><Textarea placeholder="ej., Lun-Vie, no disponible en festivos específicos, disponible para horas extra martes y jueves" {...field} disabled={isLoading} rows={3} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="constraints" render={({ field }) => (
                  <FormItem><FormLabel>Restricciones Específicas</FormLabel><FormControl><Textarea placeholder="ej., Máx 40 horas/semana, no más de 2 turnos de noche seguidos" {...field} disabled={isLoading} rows={3} /></FormControl><FormMessage /></FormItem>
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
