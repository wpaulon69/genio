"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Service } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

const step1Schema = z.object({
  nombre_servicio: z.string().min(1, "El nombre del servicio es obligatorio"),
  descripcion: z.string().optional(),
});

const step2Schema = z.object({
  habilitar_turno_noche: z.boolean(),
  dotacion_objetivo_lunes_a_viernes_mananas: z.coerce.number().int().nonnegative(),
  dotacion_objetivo_lunes_a_viernes_tardes: z.coerce.number().int().nonnegative(),
  dotacion_objetivo_lunes_a_viernes_noche: z.coerce.number().int().nonnegative().optional(),
  dotacion_objetivo_sab_dom_feriados_mananas: z.coerce.number().int().nonnegative(),
  dotacion_objetivo_sab_dom_feriados_tardes: z.coerce.number().int().nonnegative(),
  dotacion_objetivo_sab_dom_feriados_noche: z.coerce.number().int().nonnegative().optional(),
  max_dias_trabajo_consecutivos: z.coerce.number().int().min(0).max(14),
  dias_trabajo_consecutivos_preferidos: z.coerce.number().int().min(0).max(14),
  max_descansos_consecutivos: z.coerce.number().int().min(0).max(14),
  dias_descanso_consecutivos_preferidos: z.coerce.number().int().min(0).max(14),
  min_descansos_requeridos_antes_de_trabajar: z.coerce.number().int().min(0).max(7),
  fds_descanso_completo_objetivo: z.coerce.number().int().min(0).max(5),
  notas_adicionales: z.string().optional(),
});

const serviceSchema = step1Schema.merge(step2Schema).superRefine((data, ctx) => {
  if (data.habilitar_turno_noche) {
    if (data.dotacion_objetivo_lunes_a_viernes_noche === undefined || data.dotacion_objetivo_lunes_a_viernes_noche === null || isNaN(data.dotacion_objetivo_lunes_a_viernes_noche)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dotacion_objetivo_lunes_a_viernes_noche'],
        message: 'Requerido si el turno noche está habilitado.',
      });
    }
    if (data.dotacion_objetivo_sab_dom_feriados_noche === undefined || data.dotacion_objetivo_sab_dom_feriados_noche === null || isNaN(data.dotacion_objetivo_sab_dom_feriados_noche)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dotacion_objetivo_sab_dom_feriados_noche'],
        message: 'Requerido si el turno noche está habilitado.',
      });
    }
  }
});

type ServiceFormData = z.infer<typeof serviceSchema>;

interface ServiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (service: Service) => void;
  service?: Service | null;
  isLoading?: boolean;
}

export default function ServiceForm({ isOpen, onClose, onSubmit, service, isLoading }: ServiceFormProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);

  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      nombre_servicio: '',
      descripcion: '',
      habilitar_turno_noche: false,
      dotacion_objetivo_lunes_a_viernes_mananas: 0,
      dotacion_objetivo_lunes_a_viernes_tardes: 0,
      dotacion_objetivo_lunes_a_viernes_noche: 0,
      dotacion_objetivo_sab_dom_feriados_mananas: 0,
      dotacion_objetivo_sab_dom_feriados_tardes: 0,
      dotacion_objetivo_sab_dom_feriados_noche: 0,
      max_dias_trabajo_consecutivos: 6,
      dias_trabajo_consecutivos_preferidos: 5,
      max_descansos_consecutivos: 3,
      dias_descanso_consecutivos_preferidos: 2,
      min_descansos_requeridos_antes_de_trabajar: 1,
      fds_descanso_completo_objetivo: 1,
      notas_adicionales: '',
    },
  });

  const enableNightShiftValue = form.watch('habilitar_turno_noche');

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      if (service) {
        form.reset({
          ...service,
          descripcion: service.descripcion || '',
          notas_adicionales: service.notas_adicionales || '',
        });
      } else {
        form.reset();
      }
    }
  }, [service, isOpen, form]);

  const handleFormSubmit = (data: ServiceFormData) => {
    const submissionData = { ...data };
    if (!submissionData.habilitar_turno_noche) {
        submissionData.dotacion_objetivo_lunes_a_viernes_noche = 0;
        submissionData.dotacion_objetivo_sab_dom_feriados_noche = 0;
    }
    if (service) {
      (submissionData as Service).id_servicio = service.id_servicio;
    }
    onSubmit(submissionData as Service);
  };

  const onFormError = (errors: any) => {
    console.error("Form validation errors:", errors);
    toast({
      variant: "destructive",
      title: "Error de Validación",
      description: "Por favor, revise los campos del formulario. Hay errores de validación.",
    });
  };

  const handleNextStep = async () => {
    const isValid = await form.trigger(['nombre_servicio', 'descripcion']);
    if (isValid) {
      setCurrentStep(2);
    } else {
        toast({
            variant: "destructive",
            title: "Error de Validación",
            description: "Por favor, complete los campos del Paso 1 antes de continuar.",
        });
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-2xl md:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{service ? 'Editar Servicio' : 'Añadir Nuevo Servicio'} - Paso {currentStep} de 2</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit, onFormError)} className="flex flex-col flex-grow min-h-0">
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
              {currentStep === 1 && (
                <>
                  <FormField control={form.control} name="nombre_servicio" render={({ field }) => (
                    <FormItem><FormLabel>Nombre del Servicio</FormLabel><FormControl><Input placeholder="ej., Sala de Emergencias" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="descripcion" render={({ field }) => (
                    <FormItem><FormLabel>Descripción</FormLabel><FormControl><Textarea placeholder="Describa brevemente el servicio" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </>
              )}
              {currentStep === 2 && (
                <>
                  <h3 className="text-lg font-medium pt-2">Dotación Objetivo</h3>
                  <FormField control={form.control} name="habilitar_turno_noche" render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel className="font-normal text-base">Habilitar Turno Noche (N)</FormLabel>
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <div className="space-y-3 p-4 border rounded-md">
                      <FormLabel className="text-base font-semibold block mb-2">Lunes a Viernes</FormLabel>
                      <FormField control={form.control} name="dotacion_objetivo_lunes_a_viernes_mananas" render={({ field }) => (
                        <FormItem><FormLabel>Mañanas (L-V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="dotacion_objetivo_lunes_a_viernes_tardes" render={({ field }) => (
                        <FormItem><FormLabel>Tardes (L-V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      {enableNightShiftValue && (
                        <FormField control={form.control} name="dotacion_objetivo_lunes_a_viernes_noche" render={({ field }) => (
                          <FormItem><FormLabel>Noches (L-V)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      )}
                    </div>
                    <div className="space-y-3 p-4 border rounded-md">
                      <FormLabel className="text-base font-semibold block mb-2">Sáb, Dom y Feriados</FormLabel>
                      <FormField control={form.control} name="dotacion_objetivo_sab_dom_feriados_mananas" render={({ field }) => (
                        <FormItem><FormLabel>Mañanas (S,D,F)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="dotacion_objetivo_sab_dom_feriados_tardes" render={({ field }) => (
                        <FormItem><FormLabel>Tardes (S,D,F)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      {enableNightShiftValue && (
                        <FormField control={form.control} name="dotacion_objetivo_sab_dom_feriados_noche" render={({ field }) => (
                          <FormItem><FormLabel>Noches (S,D,F)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      )}
                    </div>
                  </div>
                  <Separator className="my-6" />
                  <h3 className="text-lg font-medium">Reglas de Planificación</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <FormField control={form.control} name="max_dias_trabajo_consecutivos" render={({ field }) => (
                      <FormItem><FormLabel>Máx. Días Trabajo Consecutivos</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="dias_trabajo_consecutivos_preferidos" render={({ field }) => (
                      <FormItem><FormLabel>Días Trabajo Consecutivos Preferidos</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="max_descansos_consecutivos" render={({ field }) => (
                      <FormItem><FormLabel>Máx. Descansos Consecutivos</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="dias_descanso_consecutivos_preferidos" render={({ field }) => (
                      <FormItem><FormLabel>Días Descanso Consecutivos Preferidos</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="min_descansos_requeridos_antes_de_trabajar" render={({ field }) => (
                      <FormItem><FormLabel>Mín. Descansos Requeridos Antes de Trabajar</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="fds_descanso_completo_objetivo" render={({ field }) => (
                      <FormItem><FormLabel>FDS Descanso Completos Objetivo (Mensual)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <Separator className="my-6" />
                  <FormField control={form.control} name="notas_adicionales" render={({ field }) => (
                    <FormItem><FormLabel>Notas Adicionales</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </>
              )}
            </div>
            <DialogFooter className="border-t pt-4 flex justify-between w-full flex-shrink-0 mt-auto">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <div className="flex gap-2">
                {currentStep > 1 && (<Button type="button" variant="outline" onClick={() => setCurrentStep(1)}>Anterior</Button>)}
                {currentStep < 2 && (<Button type="button" onClick={handleNextStep}>Siguiente</Button>)}
                {currentStep === 2 && (<Button type="submit" disabled={isLoading}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (service ? 'Guardar Cambios' : 'Crear Servicio')}</Button>)}
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
