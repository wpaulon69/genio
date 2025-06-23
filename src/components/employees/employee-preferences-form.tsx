"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import type { Employee, TurnoFijo, AsignacionEmpleado, TipoAsignacion } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import React, { useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Input } from '../ui/input';

const preferencesSchema = z.object({
  turnos_fijos: z.array(z.object({
    dia_semana: z.enum(['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']),
    tipo_turno: z.enum(['Mañana', 'Tarde', 'Noche', 'Descanso']),
  })).optional(),
  asignaciones: z.array(
    z.object({
      id_tipo_asignacion: z.coerce.number().min(1, "Debe seleccionar un tipo de asignación"),
      fecha_inicio: z.string().min(1, "La fecha de inicio es obligatoria"),
      fecha_fin: z.string().min(1, "La fecha de fin es obligatoria"),
      descripcion: z.string().optional(),
    }).refine(data => {
      if (data.fecha_inicio && data.fecha_fin) {
        return new Date(data.fecha_fin) >= new Date(data.fecha_inicio);
      }
      return true;
    }, {
      message: "La fecha de fin no puede ser anterior a la fecha de inicio",
      path: ["fecha_fin"],
    })
  ).optional(),
});

type PreferencesFormData = z.infer<typeof preferencesSchema>;

interface EmployeePreferencesFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PreferencesFormData) => void;
  employee: Employee;
  availableAssignmentTypes: TipoAsignacion[];
  isLoading?: boolean;
}

export default function EmployeePreferencesForm({ isOpen, onClose, onSubmit, employee, availableAssignmentTypes, isLoading }: EmployeePreferencesFormProps) {
  const form = useForm<PreferencesFormData>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
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
        turnos_fijos: employee.turnos_fijos || [],
        asignaciones: employee.asignaciones?.map(a => ({ ...a, descripcion: a.descripcion || '' })) || [],
      });
    }
  }, [employee, form]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-2xl md:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Preferencias de {employee.nombre}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-grow min-h-0">
            <ScrollArea className="flex-grow p-4">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Turnos Fijos</h3>
                  <Separator className="my-2" />
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
                      <p>Día de la Semana</p>
                      <p>Tipo de Turno</p>
                      <span />
                    </div>
                    {turnosFijosFields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                        <FormField control={form.control} name={`turnos_fijos.${index}.dia_semana`} render={({ field }) => (
                          <FormItem>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Día" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`turnos_fijos.${index}.tipo_turno`} render={({ field }) => (
                          <FormItem>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Turno" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {['Mañana', 'Tarde', 'Noche', 'Descanso'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeTurnoFijo(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => appendTurnoFijo({ dia_semana: 'Lunes', tipo_turno: 'Mañana' })}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Turno Fijo
                  </Button>
                </div>
                <div>
                  <h3 className="text-lg font-medium">Asignaciones Especiales (Licencias, etc.)</h3>
                  <Separator className="my-2" />
                  <div className="space-y-3">
                    {asignacionesFields.map((field, index) => (
                      <div key={field.id} className="p-3 border rounded-lg space-y-3">
                        <div className="flex items-start space-x-2">
                          <FormField control={form.control} name={`asignaciones.${index}.id_tipo_asignacion`} render={({ field }) => (
                            <FormItem className="flex-grow">
                              <FormLabel>Tipo de Asignación</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value.toString()}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                  {availableAssignmentTypes.map(t => <SelectItem key={t.id_tipo_asignacion} value={t.id_tipo_asignacion.toString()}>{t.nombre_tipo}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeAsignacion(index)} className="mt-1">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2">
                          <FormField control={form.control} name={`asignaciones.${index}.fecha_inicio`} render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fecha Inicio</FormLabel>
                              <FormControl><Input type="date" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name={`asignaciones.${index}.fecha_fin`} render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fecha Fin</FormLabel>
                              <FormControl><Input type="date" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => appendAsignacion({ id_tipo_asignacion: 0, fecha_inicio: '', fecha_fin: '' })}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Asignación
                  </Button>
                </div>
              </div>
            </ScrollArea>
            <DialogFooter className="mt-auto pt-4 flex justify-between w-full flex-shrink-0">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Preferencias</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
