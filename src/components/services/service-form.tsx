
"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Service, StaffingNeeds, ConsecutivenessRules } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

/** Esquema de validación para las necesidades de personal. */
const staffingNeedsSchema = z.object({
  morningWeekday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  afternoonWeekday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  nightWeekday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  morningWeekendHoliday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  afternoonWeekendHoliday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  nightWeekendHoliday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
});

/** Esquema de validación para las reglas de consecutividad. */
const consecutivenessRulesSchema = z.object({
  maxConsecutiveWorkDays: z.coerce.number().int().min(0, "Debe ser 0 o más").max(14, "Máximo 14 días"),
  preferredConsecutiveWorkDays: z.coerce.number().int().min(0, "Debe ser 0 o más").max(14, "Máximo 14 días"),
  maxConsecutiveDaysOff: z.coerce.number().int().min(0, "Debe ser 0 o más").max(14, "Máximo 14 días"),
  preferredConsecutiveDaysOff: z.coerce.number().int().min(0, "Debe ser 0 o más").max(14, "Máximo 14 días"),
  minConsecutiveDaysOffRequiredBeforeWork: z.coerce.number().int().min(0, "Debe ser 0 o más").max(7, "Máximo 7 días").optional(),
}).refine(data => data.preferredConsecutiveWorkDays <= data.maxConsecutiveWorkDays, {
  message: "Preferidos no pueden exceder el máximo de días de trabajo consecutivos",
  path: ["preferredConsecutiveWorkDays"],
}).refine(data => data.preferredConsecutiveDaysOff <= data.maxConsecutiveDaysOff, {
  message: "Preferidos no pueden exceder el máximo de días de descanso consecutivos",
  path: ["preferredConsecutiveDaysOff"],
});

/** Esquema de validación principal para el formulario de servicio. */
const serviceSchema = z.object({
  name: z.string().min(1, "El nombre del servicio es obligatorio"),
  description: z.string().min(1, "La descripción es obligatoria"),
  enableNightShift: z.boolean(),
  staffingNeeds: staffingNeedsSchema,
  consecutivenessRules: consecutivenessRulesSchema.optional(),
  targetCompleteWeekendsOff: z.coerce.number().int().min(0, { message: "Debe ser 0 o más." }).max(5, { message: "No puede ser más de 5."}).optional(),
  additionalNotes: z.string().optional(),
});

/** Tipo inferido de los datos del formulario de servicio. */
type ServiceFormData = z.infer<typeof serviceSchema>;

/** Props para el componente `ServiceForm`. */
interface ServiceFormProps {
  /** Indica si el diálogo del formulario está abierto. */
  isOpen: boolean;
  /** Función para cerrar el diálogo. */
  onClose: () => void;
  /** Función que se ejecuta al enviar el formulario con datos válidos. */
  onSubmit: (service: Service) => void;
  /** Datos de un servicio existente para edición, o `null`/`undefined` para un nuevo servicio. */
  service?: Service | null;
  /** Indica si el formulario está en estado de carga (ej. enviando datos). */
  isLoading?: boolean;
}

/** Valores por defecto para las reglas de consecutividad si no se proporcionan. */
const defaultConsecutivenessRules: ConsecutivenessRules = {
  maxConsecutiveWorkDays: 6,
  preferredConsecutiveWorkDays: 5,
  maxConsecutiveDaysOff: 3,
  preferredConsecutiveDaysOff: 2,
  minConsecutiveDaysOffRequiredBeforeWork: 1,
};

/** Valores por defecto para las necesidades de personal si no se proporcionan. */
const defaultStaffingNeeds: StaffingNeeds = {
  morningWeekday: 0,
  afternoonWeekday: 0,
  nightWeekday: 0,
  morningWeekendHoliday: 0,
  afternoonWeekendHoliday: 0,
  nightWeekendHoliday: 0,
};

const defaultTargetCompleteWeekendsOff = 1;

/**
 * `ServiceForm` es un componente de diálogo modal utilizado para crear o editar servicios.
 * Utiliza `react-hook-form` para la gestión del formulario y `zod` para la validación.
 * El formulario está dividido en dos pasos para mejorar la usabilidad.
 * El área de contenido de los pasos es desplazable si el contenido excede la altura disponible.
 *
 * @param {ServiceFormProps} props - Las props del componente.
 * @returns {JSX.Element | null} El elemento JSX del diálogo del formulario, o `null` si no está abierto.
 */
export default function ServiceForm({ isOpen, onClose, onSubmit, service, isLoading }: ServiceFormProps) {
  const [currentStep, setCurrentStep] = useState(1);

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      description: '',
      enableNightShift: false,
      staffingNeeds: { ...defaultStaffingNeeds },
      consecutivenessRules: { ...defaultConsecutivenessRules },
      targetCompleteWeekendsOff: defaultTargetCompleteWeekendsOff,
      additionalNotes: '',
    },
  });

  const enableNightShiftValue = form.watch('enableNightShift');

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      if (service) {
        form.reset({
          name: service.name,
          description: service.description,
          enableNightShift: service.enableNightShift || false,
          staffingNeeds: service.staffingNeeds || { ...defaultStaffingNeeds },
          consecutivenessRules: service.consecutivenessRules || { ...defaultConsecutivenessRules },
          targetCompleteWeekendsOff: service.targetCompleteWeekendsOff === undefined ? defaultTargetCompleteWeekendsOff : service.targetCompleteWeekendsOff,
          additionalNotes: service.additionalNotes || '',
        });
      } else {
        form.reset({
          name: '',
          description: '',
          enableNightShift: false,
          staffingNeeds: { ...defaultStaffingNeeds },
          consecutivenessRules: { ...defaultConsecutivenessRules },
          targetCompleteWeekendsOff: defaultTargetCompleteWeekendsOff,
          additionalNotes: '',
        });
      }
    }
  }, [service, form, isOpen]);

  useEffect(() => {
    if (!enableNightShiftValue) {
      form.setValue('staffingNeeds.nightWeekday', 0, { shouldValidate: true });
      form.setValue('staffingNeeds.nightWeekendHoliday', 0, { shouldValidate: true });
    }
  }, [enableNightShiftValue, form]);

  const handleFormSubmit = (data: ServiceFormData) => {
    const finalData = { ...data };
    if (!finalData.enableNightShift) {
      finalData.staffingNeeds.nightWeekday = 0;
      finalData.staffingNeeds.nightWeekendHoliday = 0;
    }
    finalData.consecutivenessRules = data.consecutivenessRules || { ...defaultConsecutivenessRules };
    finalData.targetCompleteWeekendsOff = data.targetCompleteWeekendsOff === undefined ? defaultTargetCompleteWeekendsOff : data.targetCompleteWeekendsOff;
    
    onSubmit({
      id: service?.id || '',
      ...finalData,
    });
  };

  const handleNextStep = async () => {
    let fieldsToValidate: (keyof ServiceFormData)[] = [];
    if (currentStep === 1) {
      fieldsToValidate = ['name', 'description'];
    }
    
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid && currentStep < 2) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-2xl md:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{service ? 'Editar Servicio' : 'Añadir Nuevo Servicio'} - Paso {currentStep} de 2</DialogTitle>
          <DialogDescription>
            {currentStep === 1 
              ? 'Complete la información básica del servicio.' 
              : 'Defina la dotación objetivo, reglas de consecutividad y notas adicionales.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="flex flex-col flex-grow min-h-0"> {/* Form to take available space */}
            
            {/* Scrollable content area for steps */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              {currentStep === 1 && (
                <>
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Nombre del Servicio</FormLabel><FormControl><Input placeholder="ej., Sala de Emergencias" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea placeholder="Describa brevemente el servicio" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                  )} />
                </>
              )}

              {currentStep === 2 && (
                <>
                  <h3 className="text-lg font-medium pt-2">Dotación Objetivo</h3>
                  <FormField control={form.control} name="enableNightShift" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLoading} /></FormControl>
                      <FormLabel className="font-normal text-base">Habilitar Turno Noche (N)</FormLabel>
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <div className="space-y-3 p-4 border rounded-md">
                      <FormLabel className="text-base font-semibold block mb-2">Lunes a Viernes</FormLabel>
                      <FormField control={form.control} name="staffingNeeds.morningWeekday" render={({ field }) => (
                        <FormItem><FormLabel>Mañanas (L-V)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="staffingNeeds.afternoonWeekday" render={({ field }) => (
                        <FormItem><FormLabel>Tardes (L-V)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                      )} />
                      {enableNightShiftValue && (
                        <FormField control={form.control} name="staffingNeeds.nightWeekday" render={({ field }) => (
                          <FormItem><FormLabel>Noches (L-V)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={!enableNightShiftValue || isLoading} /></FormControl><FormMessage /></FormItem>
                        )} />
                      )}
                    </div>
                    
                    <div className="space-y-3 p-4 border rounded-md">
                      <FormLabel className="text-base font-semibold block mb-2">Sáb, Dom y Feriados</FormLabel>
                      <FormField control={form.control} name="staffingNeeds.morningWeekendHoliday" render={({ field }) => (
                        <FormItem><FormLabel>Mañanas (S,D,F)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="staffingNeeds.afternoonWeekendHoliday" render={({ field }) => (
                        <FormItem><FormLabel>Tardes (S,D,F)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                      )} />
                      {enableNightShiftValue && (
                        <FormField control={form.control} name="staffingNeeds.nightWeekendHoliday" render={({ field }) => (
                          <FormItem><FormLabel>Noches (S,D,F)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={!enableNightShiftValue || isLoading} /></FormControl><FormMessage /></FormItem>
                        )} />
                      )}
                    </div>
                  </div>
                  
                  <Separator className="my-6" />

                  <h3 className="text-lg font-medium">Reglas de Planificación</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                      <div className="space-y-3 p-4 border rounded-md">
                          <FormField control={form.control} name="consecutivenessRules.maxConsecutiveWorkDays" render={({ field }) => (
                              <FormItem><FormLabel>Máx. Días Trabajo Consecutivos</FormLabel><FormControl><Input type="number" placeholder="6" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="consecutivenessRules.preferredConsecutiveWorkDays" render={({ field }) => (
                              <FormItem><FormLabel>Días Trabajo Consecutivos Preferidos</FormLabel><FormControl><Input type="number" placeholder="5" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                          )} />
                      </div>
                      <div className="space-y-3 p-4 border rounded-md">
                          <FormField control={form.control} name="consecutivenessRules.maxConsecutiveDaysOff" render={({ field }) => (
                              <FormItem><FormLabel>Máx. Descansos Consecutivos</FormLabel><FormControl><Input type="number" placeholder="3" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="consecutivenessRules.preferredConsecutiveDaysOff" render={({ field }) => (
                              <FormItem><FormLabel>Días Descanso Consecutivos Preferidos</FormLabel><FormControl><Input type="number" placeholder="2" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                          )} />
                      </div>
                       <div className="space-y-3 p-4 border rounded-md">
                           <FormField control={form.control} name="consecutivenessRules.minConsecutiveDaysOffRequiredBeforeWork" render={({ field }) => (
                              <FormItem><FormLabel>Mín. Descansos Requeridos Antes de Trabajar</FormLabel><FormControl><Input type="number" placeholder="1" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                          )} />
                      </div>
                      <div className="space-y-3 p-4 border rounded-md">
                          <FormField control={form.control} name="targetCompleteWeekendsOff" render={({ field }) => (
                            <FormItem>
                              <FormLabel>FDS Descanso Completos Objetivo (Mensual)</FormLabel>
                              <FormControl><Input type="number" placeholder="1" {...field} disabled={isLoading} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                      </div>
                  </div>

                  <Separator className="my-6" />
                  
                  <FormField control={form.control} name="additionalNotes" render={({ field }) => (
                    <FormItem><FormLabel>Notas Adicionales / Otras Reglas</FormLabel><FormControl><Textarea placeholder="Cualquier otra regla o nota específica del servicio..." {...field} rows={3} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                  )} />
                </>
              )}
            </div>
            
            <DialogFooter className="border-t pt-4 flex justify-between w-full flex-shrink-0 mt-auto">
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
                    {service ? 'Guardar Cambios' : 'Crear Servicio'}
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

    