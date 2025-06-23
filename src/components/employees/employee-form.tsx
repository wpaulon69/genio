"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import type { Employee, Service, TurnoFijo, AsignacionEmpleado, TipoAsignacion, PatronTrabajo } from '@/lib/types';
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

const employeeSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  email_empleado: z.string().email("Email inválido"),
  id_servicio: z.coerce.number().min(1, "Debe seleccionar un servicio"),
  tipo_patron_trabajo: z.string().min(1, "El patrón de trabajo es obligatorio"),
  elegible_franco_pos_guardia: z.boolean(),
  prefiere_trabajar_fines_semana: z.boolean(),
  disponibilidad_general: z.string().optional(),
  restricciones_especificas: z.string().optional(),
  turnos_fijos: z.array(z.object({
    dia_semana: z.string(),
    tipo_turno: z.string(),
  })).optional(),
  asignaciones: z.array(z.object({
    id_tipo_asignacion: z.coerce.number(),
    fecha_inicio: z.string(),
    fecha_fin: z.string(),
    descripcion: z.string().optional(),
  })).optional(),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (employee: Employee) => void;
  employee?: Employee | null;
  availableServices: Service[];
  isLoading?: boolean;
}

export default function EmployeeForm({ isOpen, onClose, onSubmit, employee, availableServices, isLoading }: EmployeeFormProps) {
  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      nombre: '',
      email_empleado: '',
      id_servicio: 0,
      tipo_patron_trabajo: '',
      elegible_franco_pos_guardia: false,
      prefiere_trabajar_fines_semana: false,
      disponibilidad_general: '',
      restricciones_especificas: '',
      turnos_fijos: [],
      asignaciones: [],
    },
  });

  const { fields: turnosFijosFields, append: appendTurnoFijo, remove: removeTurnoFijo } = useFieldArray({
    control: form.control,
    name: "turnos_fijos",
  });

  const { fields: asignacionesFields, append: appendAsignacion, remove: removeAsignacion } = useFieldArray({
    control: form.control,
    name: "asignaciones",
  });

  useEffect(() => {
    if (employee) {
      form.reset({
        ...employee,
        disponibilidad_general: employee.disponibilidad_general || '',
        restricciones_especificas: employee.restricciones_especificas || '',
        asignaciones: employee.asignaciones?.map(a => ({ ...a, descripcion: a.descripcion || '' })) || [],
      });
    } else {
      form.reset();
    }
  }, [employee, form]);

  const handleSubmit = (data: EmployeeFormData) => {
    const submissionData = { ...data };
    if (employee) {
      (submissionData as Employee).id_empleado = employee.id_empleado;
    }
    onSubmit(submissionData as Employee);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-3xl md:max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{employee ? 'Editar Empleado' : 'Añadir Nuevo Empleado'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-grow min-h-0">
            <ScrollArea className="flex-grow overflow-y-auto"> 
              <div className="space-y-4 p-4">
                <FormField control={form.control} name="nombre" render={({ field }) => (
                  <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email_empleado" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="id_servicio" render={({ field }) => (
                  <FormItem><FormLabel>Servicio</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value.toString()}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {availableServices.map(s => <SelectItem key={s.id_servicio} value={s.id_servicio.toString()}>{s.nombre_servicio}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  <FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="tipo_patron_trabajo" render={({ field }) => (
                    <FormItem><FormLabel>Patrón de Trabajo</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="flex items-center space-x-4">
                    <FormField control={form.control} name="elegible_franco_pos_guardia" render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Elegible para Franco Post-Guardia</FormLabel></div></FormItem>
                    )} />
                    <FormField control={form.control} name="prefiere_trabajar_fines_semana" render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Prefiere Trabajar Fines de Semana</FormLabel></div></FormItem>
                    )} />
                </div>
                <FormField control={form.control} name="disponibilidad_general" render={({ field }) => (
                    <FormItem><FormLabel>Disponibilidad General</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="restricciones_especificas" render={({ field }) => (
                    <FormItem><FormLabel>Restricciones Específicas</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </ScrollArea>
            <DialogFooter className="mt-auto pt-4 flex justify-between w-full flex-shrink-0">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{employee ? 'Guardar Cambios' : 'Crear Empleado'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
