
"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Holiday } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format, parseISO, isValid as isValidDate } from 'date-fns';
import { es } from 'date-fns/locale';
import React, { useEffect } from 'react';

const holidayFormSchema = z.object({
  name: z.string().min(1, "El nombre del feriado es obligatorio."),
  date: z.date({ required_error: "La fecha es obligatoria." }),
});

type HolidayFormData = z.infer<typeof holidayFormSchema>;

interface HolidayFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (holiday: Omit<Holiday, 'id'> | Holiday) => void;
  holiday?: Holiday | null;
  isLoading?: boolean;
}

export default function HolidayForm({ isOpen, onClose, onSubmit, holiday, isLoading }: HolidayFormProps) {
  const form = useForm<HolidayFormData>({
    resolver: zodResolver(holidayFormSchema),
    defaultValues: {
      name: '',
      date: new Date(), 
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (holiday) { // Editing existing holiday
        form.reset({
          name: holiday.name,
          date: holiday.date && isValidDate(parseISO(holiday.date)) ? parseISO(holiday.date) : new Date(),
        });
      } else { // Adding a new holiday
        // Only reset if the form is not yet dirty.
        // This prevents overriding a date selected by the user for a new holiday.
        if (!form.formState.isDirty) {
            form.reset({
                name: '',
                date: new Date(),
            });
        }
        // If the form is dirty, it means the user has already made changes (e.g., picked a date).
        // We do not want to reset and wipe those changes.
      }
    }
  }, [holiday, isOpen, form.reset, form.formState.isDirty]);

  const handleFormSubmit = (data: HolidayFormData) => {
    const formattedDate = format(data.date, 'yyyy-MM-dd');
    const submissionData = {
      ...data,
      date: formattedDate,
    };
    if (holiday) {
      onSubmit({ ...submissionData, id: holiday.id });
    } else {
      onSubmit(submissionData);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{holiday ? 'Editar Feriado' : 'Añadir Nuevo Feriado'}</DialogTitle>
          <DialogDescription>
            {holiday ? 'Modifique los detalles del feriado.' : 'Complete los detalles para el nuevo feriado.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Feriado</FormLabel>
                  <FormControl>
                    <Input placeholder="ej., Día de la Independencia" {...field} disabled={isLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className="pl-3 pr-3 justify-start text-left font-normal"
                          disabled={isLoading}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, 'PPP', { locale: es }) : <span>Seleccione una fecha</span>}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={isLoading}
                        initialFocus
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {holiday ? 'Guardar Cambios' : 'Añadir Feriado'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
