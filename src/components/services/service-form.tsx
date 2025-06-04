
"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import type { Service, StaffingNeeds, ConsecutivenessRules } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const staffingNeedsSchema = z.object({
  morningWeekday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  afternoonWeekday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  nightWeekday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  morningWeekendHoliday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  afternoonWeekendHoliday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
  nightWeekendHoliday: z.coerce.number().int().nonnegative({ message: "Debe ser 0 o más" }),
});

const consecutivenessRulesSchema = z.object({
  maxConsecutiveWorkDays: z.coerce.number().int().min(0, "Debe ser 0 o más").max(14, "Máximo 14 días"),
  preferredConsecutiveWorkDays: z.coerce.number().int().min(0, "Debe ser 0 o más").max(14, "Máximo 14 días"),
  maxConsecutiveDaysOff: z.coerce.number().int().min(0, "Debe ser 0 o más").max(14, "Máximo 14 días"),
  preferredConsecutiveDaysOff: z.coerce.number().int().min(0, "Debe ser 0 o más").max(14, "Máximo 14 días"),
}).refine(data => data.preferredConsecutiveWorkDays <= data.maxConsecutiveWorkDays, {
  message: "Preferidos no pueden exceder el máximo de días de trabajo consecutivos",
  path: ["preferredConsecutiveWorkDays"],
}).refine(data => data.preferredConsecutiveDaysOff <= data.maxConsecutiveDaysOff, {
  message: "Preferidos no pueden exceder el máximo de días de descanso consecutivos",
  path: ["preferredConsecutiveDaysOff"],
});

const serviceSchema = z.object({
  name: z.string().min(1, "El nombre del servicio es obligatorio"),
  description: z.string().min(1, "La descripción es obligatoria"),
  enableNightShift: z.boolean(),
  staffingNeeds: staffingNeedsSchema,
  consecutivenessRules: consecutivenessRulesSchema.optional(),
  additionalNotes: z.string().optional(),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

interface ServiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (service: Service) => void;
  service?: Service | null;
  isLoading?: boolean;
}

const defaultConsecutivenessRules: ConsecutivenessRules = {
  maxConsecutiveWorkDays: 6,
  preferredConsecutiveWorkDays: 5,
  maxConsecutiveDaysOff: 3,
  preferredConsecutiveDaysOff: 2,
};

const defaultStaffingNeeds: StaffingNeeds = {
  morningWeekday: 0,
  afternoonWeekday: 0,
  nightWeekday: 0,
  morningWeekendHoliday: 0,
  afternoonWeekendHoliday: 0,
  nightWeekendHoliday: 0,
};


export default function ServiceForm({ isOpen, onClose, onSubmit, service, isLoading }: ServiceFormProps) {
  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      description: '',
      enableNightShift: false,
      staffingNeeds: { ...defaultStaffingNeeds },
      consecutivenessRules: { ...defaultConsecutivenessRules },
      additionalNotes: '',
    },
  });

  const enableNightShiftValue = form.watch('enableNightShift');

  useEffect(() => {
    if (isOpen) {
      if (service) {
        form.reset({
          name: service.name,
          description: service.description,
          enableNightShift: service.enableNightShift || false,
          staffingNeeds: service.staffingNeeds || { ...defaultStaffingNeeds },
          consecutivenessRules: service.consecutivenessRules || { ...defaultConsecutivenessRules },
          additionalNotes: service.additionalNotes || '',
        });
      } else {
        form.reset({
          name: '',
          description: '',
          enableNightShift: false,
          staffingNeeds: { ...defaultStaffingNeeds },
          consecutivenessRules: { ...defaultConsecutivenessRules },
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

  const handleSubmit = (data: ServiceFormData) => {
    const finalData = { ...data };
    if (!finalData.enableNightShift) {
      finalData.staffingNeeds.nightWeekday = 0;
      finalData.staffingNeeds.nightWeekendHoliday = 0;
    }
    // Ensure consecutivenessRules is always an object
    finalData.consecutivenessRules = data.consecutivenessRules || { ...defaultConsecutivenessRules };
    
    onSubmit({
      id: service?.id || '',
      ...finalData,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-2xl"> {/* Increased width */}
        <DialogHeader>
          <DialogTitle>{service ? 'Editar Servicio' : 'Añadir Nuevo Servicio'}</DialogTitle>
          <DialogDescription>
            {service ? 'Actualice los detalles, dotación y reglas del servicio.' : 'Complete los detalles, dotación y reglas para el nuevo servicio.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <ScrollArea className="max-h-[70vh] pr-6">
              <div className="space-y-4 pr-2">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nombre del Servicio</FormLabel><FormControl><Input placeholder="ej., Sala de Emergencias" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea placeholder="Describa brevemente el servicio" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <Separator className="my-6" />
                
                <h3 className="text-lg font-medium">Dotación Objetivo</h3>
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

                <h3 className="text-lg font-medium">Reglas de Consecutividad</h3>
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
                </div>

                <Separator className="my-6" />
                
                <FormField control={form.control} name="additionalNotes" render={({ field }) => (
                  <FormItem><FormLabel>Notas Adicionales / Otras Reglas</FormLabel><FormControl><Textarea placeholder="Cualquier otra regla o nota específica del servicio..." {...field} rows={3} disabled={isLoading} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </ScrollArea>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {service ? 'Guardar Cambios' : 'Crear Servicio'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
