
"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import type { Employee, Service, EmployeePreferences, FixedAssignment as FixedAssignmentType, WorkPattern } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import React, { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, CalendarIcon, PlusCircle, Trash2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO, isValid as isValidDate } from 'date-fns';
import { es } from 'date-fns/locale';

const NO_FIXED_TIMING_VALUE = "none_selected";
const REST_DAY_VALUE = "rest_day";

// Form-specific type for FixedAssignment, includes client-side 'id' for useFieldArray
type FormFixedAssignment = Omit<FixedAssignmentType, 'startDate' | 'endDate' | 'type'> & {
  id: string;
  type: 'D' | 'LAO' | 'LM' | ''; // Allow empty for initial state for form binding
  startDate?: Date;
  endDate?: Date;
  description?: string;
};

const workPatternSchema = z.enum(['standardRotation', 'mondayToFridayMorning', 'mondayToFridayAfternoon']).nullable().optional();

const preferencesSchema = z.object({
  eligibleForDayOffAfterDuty: z.boolean().optional(),
  prefersWeekendWork: z.boolean().optional(),
  fixedWeeklyShiftDays: z.array(z.string()).optional(),
  fixedWeeklyShiftTiming: z.string().nullable().optional(),
  workPattern: workPatternSchema,
});

const fixedAssignmentSchema = z.object({
  id: z.string(), // For react-hook-form's useFieldArray
  type: z.enum(['D', 'LAO', 'LM'], { 
    required_error: "El tipo de asignación es obligatorio.",
    invalid_type_error: "Seleccione un tipo de asignación válido."
  }),
  startDate: z.date({ required_error: "La fecha de inicio es obligatoria." }),
  endDate: z.date().optional(),
  description: z.string().optional(),
}).refine(data => {
    if ((data.type === 'LAO' || data.type === 'LM') && !data.endDate) {
        return false;
    }
    return true;
}, {
    message: "La fecha de fin es obligatoria para LAO y LM.",
    path: ['endDate'],
}).refine(data => {
    if (data.endDate && data.startDate && data.endDate < data.startDate) {
        return false;
    }
    return true;
}, {
    message: "La fecha de fin no puede ser anterior a la fecha de inicio.",
    path: ['endDate'],
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
  fixedAssignments: z.array(fixedAssignmentSchema).optional(),
});

const employeeFormValidationSchema = employeeSchemaStep1.merge(employeeSchemaStep2);

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
  { id: 'lunes', label: 'Lunes' }, { id: 'martes', label: 'Martes' }, { id: 'miercoles', label: 'Miércoles' },
  { id: 'jueves', label: 'Jueves' }, { id: 'viernes', label: 'Viernes' }, { id: 'sabado', label: 'Sábado' }, { id: 'domingo', label: 'Domingo' },
];

const shiftTimings = [
  { value: NO_FIXED_TIMING_VALUE, label: "Ninguno" }, { value: REST_DAY_VALUE, label: "D (Descanso)"},
  { value: "mañana", label: "Mañana (ej. 07:00-15:00)" }, { value: "tarde", label: "Tarde (ej. 15:00-23:00)" }, { value: "noche", label: "Noche (ej. 23:00-07:00)" },
];

const assignmentTypes = [
  { value: 'D', label: "D - Descanso" },
  { value: 'LAO', label: "LAO - Licencia Anual Ordinaria" },
  { value: 'LM', label: "LM - Licencia Médica" },
];

const workPatternOptions: { value: WorkPattern | 'standardRotation'; label: string }[] = [
    { value: 'standardRotation', label: "Rotación Estándar / Preferencias Diarias" },
    { value: 'mondayToFridayMorning', label: "L-V: Solo Mañana (Descansa S, D, Feriados L-V)" },
    { value: 'mondayToFridayAfternoon', label: "L-V: Solo Tarde (Descansa S, D, Feriados L-V)" },
];


const formDefaultPreferences: EmployeePreferences = {
  eligibleForDayOffAfterDuty: false, prefersWeekendWork: false, fixedWeeklyShiftDays: [], fixedWeeklyShiftTiming: null, workPattern: 'standardRotation',
};

export default function EmployeeForm({ isOpen, onClose, onSubmit, employee, availableServices, isLoading }: EmployeeFormProps) {
  const [currentStep, setCurrentStep] = useState(1);

  const form = useForm<EmployeeFormInput>({
    resolver: zodResolver(employeeFormValidationSchema),
    defaultValues: {
      name: '', contact: '', serviceIds: [], roles: '',
      preferences: { ...formDefaultPreferences },
      availability: '', constraints: '',
      fixedAssignments: [],
    },
  });

  const { fields: fixedAssignmentFields, append: appendFixedAssignment, remove: removeFixedAssignment } = useFieldArray({
    control: form.control,
    name: "fixedAssignments",
  });

  const watchedWorkPattern = form.watch('preferences.workPattern');

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      if (employee) {
        const currentFixedTiming = employee.preferences?.fixedWeeklyShiftTiming;
        const assignmentsForForm: FormFixedAssignment[] = (employee.fixedAssignments || []).map((assign, index) => ({
          ...assign,
          id: `initial-${index}-${Date.now()}`,
          type: assign.type || '',
          startDate: assign.startDate && isValidDate(parseISO(assign.startDate)) ? parseISO(assign.startDate) : undefined,
          endDate: assign.endDate && isValidDate(parseISO(assign.endDate)) ? parseISO(assign.endDate) : undefined,
        }));

        form.reset({
          name: employee.name,
          contact: employee.contact,
          serviceIds: employee.serviceIds || [],
          roles: employee.roles ? employee.roles.join(', ') : '',
          preferences: {
            eligibleForDayOffAfterDuty: employee.preferences?.eligibleForDayOffAfterDuty ?? formDefaultPreferences.eligibleForDayOffAfterDuty,
            prefersWeekendWork: employee.preferences?.prefersWeekendWork ?? formDefaultPreferences.prefersWeekendWork,
            fixedWeeklyShiftDays: employee.preferences?.fixedWeeklyShiftDays || formDefaultPreferences.fixedWeeklyShiftDays,
            fixedWeeklyShiftTiming: (currentFixedTiming && shiftTimings.some(st => st.value === currentFixedTiming)) ? currentFixedTiming : NO_FIXED_TIMING_VALUE,
            workPattern: employee.preferences?.workPattern || formDefaultPreferences.workPattern,
          },
          availability: employee.availability || '',
          constraints: employee.constraints || '',
          fixedAssignments: assignmentsForForm,
        });
      } else {
        form.reset({
          name: '', contact: '', serviceIds: [], roles: '',
          preferences: { ...formDefaultPreferences },
          availability: '', constraints: '', fixedAssignments: [],
        });
      }
    }
  }, [employee, form, isOpen]);

  const handleSubmit = (data: EmployeeFormInput) => {
    const processedAssignments = (data.fixedAssignments || [])
      .map(({ id, ...rest }) => ({
        ...rest,
        type: rest.type as 'D' | 'LAO' | 'LM',
        startDate: rest.startDate ? format(rest.startDate, 'yyyy-MM-dd') : '',
        endDate: rest.endDate ? format(rest.endDate, 'yyyy-MM-dd') : undefined,
    }));

    const processedData = {
      ...data,
      roles: data.roles.split(',').map(s => s.trim()).filter(Boolean),
      preferences: data.preferences ? {
        ...data.preferences,
        fixedWeeklyShiftTiming: data.preferences.fixedWeeklyShiftTiming === NO_FIXED_TIMING_VALUE ? null : data.preferences.fixedWeeklyShiftTiming,
        fixedWeeklyShiftDays: data.preferences.fixedWeeklyShiftDays || [],
        workPattern: data.preferences.workPattern === 'standardRotation' ? null : data.preferences.workPattern,
      } : { ...formDefaultPreferences, fixedWeeklyShiftTiming: null, workPattern: null },
      fixedAssignments: processedAssignments as FixedAssignmentType[],
    };

    onSubmit({ id: employee?.id || '', ...processedData } as Employee);
  };

  const handleClearFixedShift = () => {
    form.setValue('preferences.fixedWeeklyShiftDays', [], { shouldValidate: true });
    form.setValue('preferences.fixedWeeklyShiftTiming', NO_FIXED_TIMING_VALUE, { shouldValidate: true });
  };

  const handleNextStep = async () => {
    const step1Fields: (keyof EmployeeFormInput)[] = ['name', 'contact', 'roles', 'serviceIds'];
    const isValid = await form.trigger(step1Fields);
    if (isValid) setCurrentStep(currentStep + 1);
  };

  const handlePreviousStep = () => setCurrentStep(currentStep - 1);

  const watchFixedAssignmentType = (index: number) => form.watch(`fixedAssignments.${index}.type`);
  
  const showDailyFixedPreferences = watchedWorkPattern === 'standardRotation' || !watchedWorkPattern;


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-3xl md:max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar Empleado' : 'Añadir Nuevo Empleado'} - Paso {currentStep} de 2</DialogTitle>
          <DialogDescription>
            {currentStep === 1 ? 'Complete la información básica y servicios.' : 'Defina patrón de trabajo, preferencias, turno fijo y asignaciones.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3">
            <ScrollArea className="max-h-[calc(85vh-220px)] pr-4 -mr-2 py-2"> {/* Ajuste aquí */}
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
                    <FormField control={form.control} name="serviceIds" render={() => (
                        <FormItem>
                          <FormLabel>Servicios Asignables</FormLabel>
                          {availableServices.length === 0 && <p className="text-sm text-muted-foreground">No hay servicios disponibles.</p>}
                          <div className="grid grid-cols-2 gap-2">
                            {availableServices.map((service) => (
                              <FormField key={service.id} control={form.control} name="serviceIds" render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 my-1 p-2 border rounded-md hover:bg-muted/50">
                                    <FormControl><Checkbox checked={field.value?.includes(service.id)} onCheckedChange={(checked) => field.onChange(checked ? [...(field.value || []), service.id] : (field.value || []).filter(v => v !== service.id))} disabled={isLoading} /></FormControl>
                                    <FormLabel className="font-normal text-sm">{service.name}</FormLabel>
                                  </FormItem>
                                )} /> ))}
                          </div><FormMessage />
                        </FormItem>)} />
                  </>
                )}

                {currentStep === 2 && (
                  <>
                    <h3 className="text-md font-semibold">Patrón de Trabajo General</h3>
                     <FormField control={form.control} name="preferences.workPattern" render={({ field }) => (
                        <FormItem><FormLabel>Tipo de Patrón de Trabajo</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || 'standardRotation'} disabled={isLoading}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar patrón..." /></SelectTrigger></FormControl>
                            <SelectContent>{workPatternOptions.map(opt => (<SelectItem key={opt.value || 'standard'} value={opt.value || 'standardRotation'}>{opt.label}</SelectItem>))}</SelectContent>
                          </Select>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground mt-1">
                            Si elige un patrón "Lunes a Viernes", este tendrá prioridad sobre las preferencias de turno fijo diario.
                          </p>
                        </FormItem>)} />

                    <Separator className="my-4" />
                    <h3 className="text-md font-semibold">Preferencias Adicionales</h3>
                    <FormField control={form.control} name="preferences.eligibleForDayOffAfterDuty" render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLoading} /></FormControl>
                        <FormLabel className="font-normal">¿Elegible para Franco Después de Guardia (D/D)?</FormLabel>
                      </FormItem>)} />
                    <FormField control={form.control} name="preferences.prefersWeekendWork" render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 shadow-sm">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLoading} /></FormControl>
                        <FormLabel className="font-normal">Prefiere Trabajar Fines de Semana</FormLabel>
                      </FormItem>)} />

                    {showDailyFixedPreferences && (
                        <>
                            <Separator className="my-4" />
                            <h3 className="text-md font-semibold">Turno Fijo Semanal (Opcional)</h3>
                            <p className="text-xs text-muted-foreground mb-2">
                                Solo aplica si el "Patrón de Trabajo General" es "Rotación Estándar".
                            </p>
                            <FormItem><FormLabel>Días de la Semana</FormLabel>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {daysOfWeek.map((day) => (
                                <FormField key={day.id} control={form.control} name="preferences.fixedWeeklyShiftDays"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center space-x-2 space-y-0 p-2 border rounded-md hover:bg-muted/50">
                                    <FormControl><Checkbox checked={Array.isArray(field.value) && field.value?.includes(day.id)} onCheckedChange={(checked) => field.onChange(checked ? [...(Array.isArray(field.value) ? field.value : []), day.id] : (Array.isArray(field.value) ? field.value : []).filter(v => v !== day.id))} disabled={isLoading}/></FormControl>
                                    <FormLabel className="font-normal text-sm">{day.label}</FormLabel>
                                    </FormItem>)} />))}
                            </div><FormMessage />
                            </FormItem>
                            <FormField control={form.control} name="preferences.fixedWeeklyShiftTiming" render={({ field }) => (
                                <FormItem><FormLabel>Horario del Turno Fijo</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || NO_FIXED_TIMING_VALUE} disabled={isLoading}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar horario" /></SelectTrigger></FormControl>
                                    <SelectContent>{shiftTimings.map(t => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}</SelectContent>
                                </Select><FormMessage />
                                </FormItem>)} />
                            <Button type="button" variant="outline" size="sm" onClick={handleClearFixedShift} disabled={isLoading}>Limpiar Turno Fijo</Button>
                        </>
                    )}


                    <Separator className="my-4" />
                    <h3 className="text-md font-semibold">Asignaciones Fijas (Descansos, Licencias)</h3>
                    <div className="space-y-4">
                      {fixedAssignmentFields.map((item, index) => {
                        const currentAssignmentType = watchFixedAssignmentType(index);
                        return (
                          <div key={item.id} className="p-4 border rounded-md space-y-3 relative">
                            <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive hover:bg-destructive/10" onClick={() => removeFixedAssignment(index)} disabled={isLoading}><Trash2 className="h-4 w-4" /></Button>
                            <FormField control={form.control} name={`fixedAssignments.${index}.type`} render={({ field }) => (
                                <FormItem><FormLabel>Tipo</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccione tipo..." /></SelectTrigger></FormControl>
                                    <SelectContent>{assignmentTypes.map(t => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}</SelectContent>
                                  </Select><FormMessage />
                                </FormItem>)} />
                            
                            <FormField control={form.control} name={`fixedAssignments.${index}.startDate`} render={({ field }) => (
                                <FormItem className="flex flex-col"><FormLabel>Fecha de Inicio</FormLabel>
                                  <Popover><PopoverTrigger asChild>
                                      <FormControl><Button variant="outline" className="justify-start text-left font-normal" disabled={isLoading}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, 'PPP', { locale: es }) : <span>Elegir fecha</span>}</Button></FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={es} disabled={isLoading} /></PopoverContent>
                                  </Popover><FormMessage />
                                </FormItem>)} />

                            {(currentAssignmentType === 'LAO' || currentAssignmentType === 'LM') && (
                              <FormField control={form.control} name={`fixedAssignments.${index}.endDate`} render={({ field }) => (
                                <FormItem className="flex flex-col"><FormLabel>Fecha de Fin</FormLabel>
                                  <Popover><PopoverTrigger asChild>
                                      <FormControl><Button variant="outline" className="justify-start text-left font-normal" disabled={isLoading}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, 'PPP', { locale: es }) : <span>Elegir fecha</span>}</Button></FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={es} disabled={isLoading} /></PopoverContent>
                                  </Popover><FormMessage />
                                </FormItem>)} />
                            )}
                             <FormField control={form.control} name={`fixedAssignments.${index}.description`} render={({ field }) => (
                                <FormItem><FormLabel>Descripción (Opcional)</FormLabel><FormControl><Input placeholder="Motivo o detalle adicional" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </div>
                        );
                      })}
                      <Button type="button" variant="outline" size="sm" onClick={() => appendFixedAssignment({ id: `new-${Date.now()}`, type: '', startDate: undefined, endDate: undefined, description: '' })} disabled={isLoading}><PlusCircle className="mr-2 h-4 w-4" />Añadir Asignación</Button>
                    </div>


                    <Separator className="my-4" />
                    <h3 className="text-md font-semibold">Otros Detalles</h3>
                    <FormField control={form.control} name="availability" render={({ field }) => (
                      <FormItem><FormLabel>Disponibilidad General</FormLabel><FormControl><Textarea placeholder="ej., Lun-Vie, no disponible en festivos..." {...field} disabled={isLoading} rows={3} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="constraints" render={({ field }) => (
                      <FormItem><FormLabel>Restricciones Específicas</FormLabel><FormControl><Textarea placeholder="ej., Máx 40 horas/semana..." {...field} disabled={isLoading} rows={3} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </>
                )}
              </div>
            </ScrollArea>
            <DialogFooter className="pt-4 flex justify-between w-full">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
              <div className="flex gap-2">
                {currentStep > 1 && (<Button type="button" variant="outline" onClick={handlePreviousStep} disabled={isLoading}>Anterior</Button>)}
                {currentStep < 2 && (<Button type="button" onClick={handleNextStep} disabled={isLoading}>Siguiente</Button>)}
                {currentStep === 2 && (<Button type="submit" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{employee ? 'Guardar Cambios' : 'Crear Empleado'}</Button>)}
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    