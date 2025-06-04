"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'; // Added AlertTriangle
import { suggestShiftSchedule, type SuggestShiftScheduleInput } from '@/ai/flows/suggest-shift-schedule';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const shiftPromptSchema = z.object({
  prompt: z.string().min(50, "El prompt debe tener al menos 50 caracteres para proporcionar suficientes detalles para la generación del horario."),
});

type ShiftPromptFormData = z.infer<typeof shiftPromptSchema>;

interface ShiftGeneratorFormProps {
  onScheduleGenerated: (scheduleText: string) => void;
}

export default function ShiftGeneratorForm({ onScheduleGenerated }: ShiftGeneratorFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [generatedSchedule, setGeneratedSchedule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ShiftPromptFormData>({
    resolver: zodResolver(shiftPromptSchema),
    defaultValues: {
      prompt: `Genere un horario de turnos de 7 días para el servicio de Emergencias comenzando el próximo lunes. 
Personal disponible: 
- Dr. Smith (Médico, prefiere mañanas, máx 40h/semana)
- Enfermera Johnson (Enfermera, flexible, prefiere turnos de 12h)
- Enfermera Lee (Enfermera, no puede trabajar los miércoles)
- Técnico Brown (Técnico, disponible Lun, Mar, Vie, Sáb)
Reglas:
- Mínimo 1 médico y 2 enfermeras de guardia en todo momento.
- Se requiere 1 técnico de 8 AM a 8 PM.
- Los turnos son típicamente de 8 o 12 horas.
- Asegure períodos de descanso adecuados entre turnos (mín 10 horas).
- Distribuya la carga de trabajo de manera equitativa entre el personal.
- Considere las preferencias indicadas cuando sea posible.
Presente el horario en un formato claro, día por día, empleado por empleado.`,
    },
  });

  const handleSubmit = async (data: ShiftPromptFormData) => {
    setIsLoading(true);
    setGeneratedSchedule(null);
    setError(null);
    try {
      const input: SuggestShiftScheduleInput = { prompt: data.prompt };
      const result = await suggestShiftSchedule(input);
      setGeneratedSchedule(result.schedule);
      onScheduleGenerated(result.schedule); // Callback for parent
    } catch (e) {
      console.error("Error generando el horario:", e);
      setError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante la generación del horario.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-headline flex items-center">
          <Sparkles className="mr-2 h-6 w-6 text-primary" />
          Generador de Turnos con IA
        </CardTitle>
        <CardDescription>
          Proporcione los requisitos detallados para el horario de turnos. La IA intentará generar un horario óptimo basado en su entrada.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prompt de Programación</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describa las reglas del servicio, preferencias de los empleados, disponibilidad, rango de fechas, etc."
                      rows={15}
                      className="min-h-[200px] font-code text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground pt-1">
                    Sea lo más específico posible para obtener los mejores resultados. Incluya fechas, nombres del personal, roles, restricciones específicas y el formato de salida deseado.
                  </p>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-4">
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generar Horario
                </>
              )}
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Falló la Generación</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {generatedSchedule && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Sugerencia de Horario Generado</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={generatedSchedule}
                    readOnly
                    rows={15}
                    className="min-h-[200px] font-code text-sm bg-muted/50"
                  />
                   <p className="text-xs text-muted-foreground pt-2">
                    Revise el horario generado. Es posible que deba refinar su prompt o realizar ajustes manuales.
                  </p>
                </CardContent>
              </Card>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
