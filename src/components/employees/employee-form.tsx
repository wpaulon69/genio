
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
import React, { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const NO_FIXED_TIMING_VALUE = "none_selected";
const REST_DAY_VALUE = "rest_day";

const preferencesSchema = z.object({
  eligibleForDayOffAfterDuty: z.boolean().optional(),
  prefersWeekendWork: z.boolean().optional(),
  fixedWeeklyShiftDays: z.array(z.string()).optional(),
  fixedWeeklyShiftTiming: z.string().nullable().optional(), // Can be null
});

const employeeSchemaStep1 = z.object({
  name: z.string().min(1, "El nombre del empleado es obligatorio"),
  contact: z.string().email("Dirección de correo electrónico inválida").or(z.string().min(10, "El número de teléfono parece demasiado corto")),
  serviceIds: z.array(z.string()).min(1, "Se debe seleccionar al menos un servicio"),
  roles: z.string().min(1, "Los roles son obligatorios (separados por coma)"),
});

const employeeSchemaStep2 = z.object({
  preferences: preferencesSchema.optional(),
  availability: z.string().optional(),
  constraints: z.string().optional(),
});

// Schema for validating the raw form input
const employeeFormValidationSchema = employeeSchemaStep1.merge(employeeSchemaStep2);

// Type for the raw form input
type EmployeeFormInput = z.infer<typeof employeeFormValidationSchema>;

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
  { value: NO_FIXED_TIMING_VALUE, label: "Ninguno" },
  { value: REST_DAY_VALUE, label: "D (Descanso)"},
  { value: "mañana", label: "Mañana (ej. 07:00-15:00)" },
  { value: "tarde", label: "Tarde (ej. 15:00-23:00)" },
  { value: "noche", label: "Noche (ej. 23:00-07:00)" },
];

const formDefaultPreferences: EmployeePreferences = {
  eligibleForDayOffAfterDuty: false,
  prefersWeekendWork: false,
  fixedWeeklyShiftDays: [],
  fixedWeeklyShiftTiming: null,
};

export default function EmployeeForm({ isOpen, onClose, onSubmit, employee, availableServices, isLoading }: EmployeeFormProps) {
  const [currentStep, setCurrentStep] = useState(1);

  const form = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeFormValidationSchema),
    defaultValues: {
      name: '',
      contact: '',
      serviceIds: [],
      roles: '', // Roles as string for form input
      preferences: { ...formDefaultPreferences },
      availability: '',
      constraints: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      if (employee) {
        const currentFixedTiming = employee.preferences?.fixedWeeklyShiftTiming;
        form.reset({
          name: employee.name,
          contact: employee.contact,
          serviceIds: employee.serviceIds || [],
          roles: employee.roles ? employee.roles.join(', ') : '', // Convert roles array to string for form
          preferences: {
            eligibleForDayOffAfterDuty: employee.preferences?.eligibleForDayOffAfterDuty ?? formDefaultPreferences.eligibleForDayOffAfterDuty,
            prefersWeekendWork: employee.preferences?.prefersWeekendWork ?? formDefaultPreferences.prefersWeekendWork,
            fixedWeeklyShiftDays: employee.preferences?.fixedWeeklyShiftDays || formDefaultPreferences.fixedWeeklyShiftDays,
            fixedWeeklyShiftTiming: (currentFixedTiming && shiftTimings.some(st => st.value === currentFixedTiming)) ? currentFixedTiming : NO_FIXED_TIMING_VALUE,
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
          preferences: { ...formDefaultPreferences },
          availability: '',
          constraints: '',
        });
      }
    }
  }, [employee, form, isOpen]);

  const handleSubmit = (data: EmployeeFormInput) => {
    const processedData = {
      ...data,
      roles: data.roles.split(',').map(s => s.trim()).filter(Boolean), // Transform roles string to array
      preferences: data.preferences ? {
        ...data.preferences,
        fixedWeeklyShiftTiming: data.preferences.fixedWeeklyShiftTiming === NO_FIXED_TIMING_VALUE ? null : data.preferences.fixedWeeklyShiftTiming,
        fixedWeeklyShiftDays: data.preferences.fixedWeeklyShiftDays || []
      } : {
        ...formDefaultPreferences
      },
    };
    onSubmit({
      id: employee?.id || '', // id will be an empty string for new employees
      ...processedData,
    } as Employee);
  };

  const handleClearFixedShift = () => {
    form.setValue('preferences.fixedWeeklyShiftDays', [], { shouldValidate: true });
    form.setValue('preferences.fixedWeeklyShiftTiming', NO_FIXED_TIMING_VALUE, { shouldValidate: true });
  };

  const handleNextStep = async () => {
    const step1Fields: (keyof EmployeeFormInput)[] = ['name', 'contact', 'roles', 'serviceIds'];
    const isValid = await form.trigger(step1Fields);
    if (isValid) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    setCurrentStep(currentStep - 1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar Empleado' : 'Añadir Nuevo Empleado'} - Paso {currentStep} de 2</DialogTitle>
          <DialogDescription>
            {currentStep === 1
              ? 'Complete la información básica y servicios asignables.'
              : 'Defina las preferencias, turno fijo y otros detalles del empleado.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
            <ScrollArea className="max-h-[60vh] pr-4 -mr-2 py-2">
              <div className="space-y-4">
                {currentStep === 1 && (
                  <>
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
                  </>
                )}

                {currentStep === 2 && (
                  <>
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
                                  checked={Array.isArray(field.value) && field.value?.includes(day.id)}
                                  onCheckedChange={(checked) => {
                                    const currentDays = Array.isArray(field.value) ? field.value : [];
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
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || NO_FIXED_TIMING_VALUE}
                            disabled={isLoading}
                          >
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
                  </>
                )}
              </div>
            </ScrollArea>
            <DialogFooter className="pt-4 flex justify-between w-full">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
              <div className="flex gap-2">
                {currentStep > 1 && (
                  <Button type="button" variant="outline" onClick={handlePreviousStep} disabled={isLoading}>
                    Anterior
                  </Button>
                )}
                {currentStep < 2 && (
                  <Button type="button" onClick={handleNextStep} disabled={isLoading}>
                    Siguiente
                  </Button>
                )}
                {currentStep === 2 && (
                  <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {employee ? 'Guardar Cambios' : 'Crear Empleado'}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
