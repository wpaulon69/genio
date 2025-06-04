"use client";

import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CalendarIcon, BarChartBig, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale'; // Import Spanish locale
import type { DateRange } from 'react-day-picker';
import type { Service, Employee } from '@/lib/types';

const reportFilterSchema = z.object({
  reportType: z.string().min(1, "El tipo de informe es obligatorio"),
  serviceId: z.string().optional(),
  employeeId: z.string().optional(),
  dateRange: z.custom<DateRange | undefined>().optional(),
  reportText: z.string().optional(), // For AI summary input
}).refine(data => {
  if (data.reportType === 'shiftSummary' && (!data.reportText || data.reportText.trim().length < 20)) {
    return false;
  }
  return true;
}, {
  message: "El texto para resumir debe tener al menos 20 caracteres.",
  path: ["reportText"], // specify the path to show the error message
});


type ReportFilterFormData = z.infer<typeof reportFilterSchema>;

interface ReportFiltersProps {
  onGenerateReport: (filters: {
    reportType: string;
    serviceId?: string;
    employeeId?: string;
    dateRange?: DateRange;
    reportText?: string;
  }) => void;
  isLoading: boolean;
  services: Service[];
  employees: Employee[];
}

export default function ReportFilters({ onGenerateReport, isLoading, services, employees }: ReportFiltersProps) {
  const form = useForm<ReportFilterFormData>({
    resolver: zodResolver(reportFilterSchema),
    defaultValues: {
      reportType: 'shiftSummary', // Default to AI summary
      reportText: `Ejemplo de Informe de Turno para la Semana del 15 de Julio:
Servicio de Emergencias:
- Dr. Smith trabajó 40 horas, cubrió 3 turnos de noche. La carga de pacientes fue alta el lunes.
- Enfermera Johnson trabajó 36 horas, mayormente turnos de día. Reportó mal funcionamiento de equipo el martes.
- Enfermera Lee trabajó 24 horas, tomó el miércoles libre como solicitó.
Servicio de Cardiología:
- Dra. Alice cubrió todas las consultas de cardiología, 45 horas en total.
- Técnico Brown asistió en 15 procedimientos, trabajó 32 horas.
General: Los niveles de personal fueron adecuados pero se incurrió en algunas horas extras en Emergencias. El informe de equipo de la Enfermera Johnson necesita seguimiento. Considere la capacitación cruzada del Técnico Brown para tareas básicas de ER.`,
    },
  });

  const reportType = form.watch('reportType');

  const handleSubmit = (data: ReportFilterFormData) => {
    onGenerateReport(data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Opciones de Informe</CardTitle>
        <CardDescription>Seleccione los parámetros para generar su informe.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="reportType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Informe</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione un tipo de informe" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="shiftSummary">Resumen de Informe de Turno con IA</SelectItem>
                      <SelectItem value="employeeUtilization" disabled>Utilización de Empleados (próximamente)</SelectItem>
                      <SelectItem value="serviceUtilization" disabled>Utilización de Servicios (próximamente)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {reportType === 'shiftSummary' && (
              <FormField
                control={form.control}
                name="reportText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Texto a Resumir</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Pegue o escriba el texto del informe de turno aquí para el resumen con IA..." 
                        rows={10}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {(reportType === 'employeeUtilization' || reportType === 'serviceUtilization') && (
              <>
                <FormField
                  control={form.control}
                  name="serviceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Servicio (Opcional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Todos los Servicios" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">Todos los Servicios</SelectItem>
                          {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empleado (Opcional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Todos los Empleados" /></SelectTrigger></FormControl>
                        <SelectContent>
                           <SelectItem value="">Todos los Empleados</SelectItem>
                           {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <Controller
                    control={form.control}
                    name="dateRange"
                    render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>Rango de Fechas (Opcional)</FormLabel>
                        <Popover>
                        <PopoverTrigger asChild>
                            <FormControl>
                            <Button variant="outline" className="justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value?.from ? (
                                field.value.to ? (
                                    <>{format(field.value.from, "LLL dd, y", { locale: es })} - {format(field.value.to, "LLL dd, y", { locale: es })}</>
                                ) : (
                                    format(field.value.from, "LLL dd, y", { locale: es })
                                )
                                ) : (
                                <span>Elija un rango de fechas</span>
                                )}
                            </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={field.value?.from}
                            selected={field.value}
                            onSelect={field.onChange}
                            numberOfMonths={2}
                            locale={es}
                            />
                        </PopoverContent>
                        </Popover>
                        <FormMessage />
                    </FormItem>
                    )}
                />
              </>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChartBig className="mr-2 h-4 w-4" />}
              Generar Informe
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
