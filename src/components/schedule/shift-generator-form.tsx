
"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Loader2, AlertTriangle, Save } from 'lucide-react';
import { suggestShiftSchedule, type SuggestShiftScheduleInput, type SuggestShiftScheduleOutput, type AIShift } from '@/ai/flows/suggest-shift-schedule';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const shiftPromptSchema = z.object({
  prompt: z.string().min(50, "El prompt debe tener al menos 50 caracteres para proporcionar suficientes detalles para la generación del horario."),
});

type ShiftPromptFormData = z.infer<typeof shiftPromptSchema>;

interface ShiftGeneratorFormProps {
  onSaveShifts: (aiShifts: AIShift[]) => Promise<{ successCount: number; errorCount: number }>;
  employeesAvailable: {id: string, name: string}[]; // Para ayudar a la IA con nombres
  servicesAvailable: {id: string, name: string}[]; // Para ayudar a la IA con nombres
}

export default function ShiftGeneratorForm({ onSaveShifts, employeesAvailable, servicesAvailable }: ShiftGeneratorFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedResponseText, setGeneratedResponseText] = useState<string | null>(null);
  const [generatedAIShifts, setGeneratedAIShifts] = useState<AIShift[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultPrompt = `Genere un horario de turnos de 7 días para el servicio de Emergencias comenzando el próximo lunes.
Personal disponible y sus roles/servicios principales:
${employeesAvailable.map(emp => `- ${emp.name} (ej. Enfermero/a, Médico/a)`).join('\n')}
Servicios involucrados:
${servicesAvailable.map(srv => `- ${srv.name}`).join('\n')}

Reglas Generales (ajustar según necesidad):
- Mínimo 1 médico y 2 enfermeras de guardia en Emergencias en todo momento.
- Se requiere 1 técnico de 8 AM a 8 PM si el servicio "Técnicos" está disponible.
- Los turnos son típicamente de 8 o 12 horas.
- Asegure períodos de descanso adecuados entre turnos (mín 10 horas).
- Distribuya la carga de trabajo de manera equitativa entre el personal.
- Considere las preferencias y restricciones indicadas en el prompt si se proporcionan detalles adicionales para empleados específicos.
Presente el horario en el formato JSON especificado, incluyendo 'generatedShifts' y 'responseText'.`;


  const form = useForm<ShiftPromptFormData>({
    resolver: zodResolver(shiftPromptSchema),
    defaultValues: {
      prompt: defaultPrompt,
    },
  });
  
  React.useEffect(() => {
    // Actualizar el valor por defecto del prompt si los empleados/servicios cambian después del montaje inicial.
    // Esto es útil si los datos de empleados/servicios se cargan de forma asíncrona.
    const updatedDefaultPrompt = `Genere un horario de turnos de 7 días para el servicio de Emergencias comenzando el próximo lunes.
Personal disponible y sus roles/servicios principales:
${employeesAvailable.map(emp => `- ${emp.name} (ej. Enfermero/a, Médico/a)`).join('\n')}
Servicios involucrados:
${servicesAvailable.map(srv => `- ${srv.name}`).join('\n')}

Reglas Generales (ajustar según necesidad):
- Mínimo 1 médico y 2 enfermeras de guardia en Emergencias en todo momento.
- Se requiere 1 técnico de 8 AM a 8 PM si el servicio "Técnicos" está disponible.
- Los turnos son típicamente de 8 o 12 horas.
- Asegure períodos de descanso adecuados entre turnos (mín 10 horas).
- Distribuya la carga de trabajo de manera equitativa entre el personal.
- Considere las preferencias y restricciones indicadas en el prompt si se proporcionan detalles adicionales para empleados específicos.
Presente el horario en el formato JSON especificado, incluyendo 'generatedShifts' y 'responseText'.`;
    form.setValue('prompt', updatedDefaultPrompt, { shouldValidate: true, shouldDirty: true });
  }, [employeesAvailable, servicesAvailable, form]);


  const handleGenerateSubmit = async (data: ShiftPromptFormData) => {
    setIsGenerating(true);
    setGeneratedResponseText(null);
    setGeneratedAIShifts(null);
    setError(null);
    try {
      const input: SuggestShiftScheduleInput = { prompt: data.prompt };
      const result: SuggestShiftScheduleOutput = await suggestShiftSchedule(input);
      setGeneratedResponseText(result.responseText);
      if (result.generatedShifts && result.generatedShifts.length > 0) {
        setGeneratedAIShifts(result.generatedShifts);
      } else if (!result.responseText.toLowerCase().includes("error") && (!result.generatedShifts || result.generatedShifts.length === 0) ) {
        setError("La IA generó una respuesta pero no se encontraron turnos estructurados. Revise el texto de respuesta.");
      }
    } catch (e) {
      console.error("Error generando el horario:", e);
      setError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante la generación del horario.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveGeneratedShifts = async () => {
    if (!generatedAIShifts || generatedAIShifts.length === 0) {
      setError("No hay turnos generados para guardar.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSaveShifts(generatedAIShifts);
      // El mensaje de éxito/error para el guardado se maneja en la página principal a través de toasts.
      // Aquí podríamos optar por limpiar los turnos generados si se desea.
      // setGeneratedAIShifts(null); // Opcional: limpiar después de guardar
    } catch (e) {
       console.error("Error guardando los turnos:", e);
       setError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante el guardado de los turnos.");
    } finally {
      setIsSaving(false);
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
          Proporcione los requisitos detallados para el horario de turnos. La IA intentará generar un horario óptimo.
          Asegúrese de que los nombres de empleados y servicios en su prompt coincidan con los existentes para un mapeo correcto.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleGenerateSubmit)}>
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
                    Sea lo más específico posible. La IA usará los nombres de empleados y servicios que liste aquí.
                  </p>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-4">
            <Button type="submit" disabled={isGenerating || isSaving} className="w-full">
              {isGenerating ? (
                <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando... </>
              ) : (
                <> <Sparkles className="mr-2 h-4 w-4" /> Generar Horario Sugerido </>
              )}
            </Button>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {generatedResponseText && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Respuesta de la IA</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={generatedResponseText}
                    readOnly
                    rows={10}
                    className="min-h-[150px] font-code text-sm bg-muted/50"
                  />
                   <p className="text-xs text-muted-foreground pt-2">
                    Revise la respuesta. Si se generaron turnos estructurados, aparecerá un botón para guardarlos.
                  </p>
                </CardContent>
                {generatedAIShifts && generatedAIShifts.length > 0 && (
                  <CardFooter>
                    <Button onClick={handleSaveGeneratedShifts} disabled={isSaving || isGenerating} className="w-full">
                      {isSaving ? (
                        <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando Turnos... </>
                      ) : (
                        <> <Save className="mr-2 h-4 w-4" /> Guardar {generatedAIShifts.length} Turno(s) Generado(s) </>
                      )}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            )}
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
