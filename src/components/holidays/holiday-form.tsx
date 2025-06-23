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
import React, { useEffect, useState } from 'react';

const holidayFormSchema = z.object({
  name: z.string().min(1, "El nombre del feriado es obligatorio."),
  date: z.date({ required_error: "La fecha es obligatoria." }),
});

type HolidayFormData = z.infer<typeof holidayFormSchema>;

interface HolidayFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (holiday: Omit<Holiday, 'id'> | { id: number; name: string; date: string; }) => void;
  holiday?: Holiday | null;
  isLoading?: boolean;
}

export default function HolidayForm({ isOpen, onClose, onSubmit, holiday, isLoading }: HolidayFormProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const form = useForm<HolidayFormData>({
    resolver: zodResolver(holidayFormSchema),
    defaultValues: {
      name: '',
      date: new Date(), 
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (holiday) {
        form.reset({
          name: holiday.name,
          date: holiday.date && isValidDate(parseISO(holiday.date)) ? parseISO(holiday.date) : new Date(),
        });
      } else {
        form.reset({
          name: '',
          date: new Date(),
        });
      }
    }
  }, [holiday, isOpen]); // Removido 'form' de las dependencias

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
                  <Button
                    type="button"
                    variant="outline"
                    className="pl-3 pr-3 justify-start text-left font-normal"
                    onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                    disabled={isLoading}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {field.value ? format(field.value, 'PPP', { locale: es }) : <span>Seleccione una fecha</span>}
                  </Button>
                  {isCalendarOpen && (
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        setIsCalendarOpen(false);
                      }}
                      disabled={isLoading}
                      initialFocus
                      locale={es}
                      className="rounded-md border"
                    />
                  )}
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
