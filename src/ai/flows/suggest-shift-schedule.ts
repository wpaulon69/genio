// src/ai/flows/suggest-shift-schedule.ts
'use server';

/**
 * @fileOverview Este archivo define un flujo de Genkit para sugerir un horario de turnos basado en un prompt.
 *
 * El flujo toma un prompt que describe los requisitos para el horario de turnos y devuelve un horario sugerido.
 * Utiliza la función ai.generate para generar el horario de turnos basado en el prompt.
 *
 * @interface SuggestShiftScheduleInput - Define el esquema de entrada para la función suggestShiftSchedule.
 * @interface SuggestShiftScheduleOutput - Define el esquema de salida para la función suggestShiftSchedule.
 * @function suggestShiftSchedule - La función principal que desencadena el flujo de generación de horarios de turnos.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestShiftScheduleInputSchema = z.object({
  prompt: z.string().describe('Un prompt detallado que describe los requisitos del horario de turnos, incluyendo reglas del servicio, preferencias de los empleados y disponibilidad.'),
});
export type SuggestShiftScheduleInput = z.infer<typeof SuggestShiftScheduleInputSchema>;

const SuggestShiftScheduleOutputSchema = z.object({
  schedule: z.string().describe('El horario de turnos generado en un formato legible por humanos.'),
});
export type SuggestShiftScheduleOutput = z.infer<typeof SuggestShiftScheduleOutputSchema>;

/**
 * La función principal para sugerir un horario de turnos basado en la entrada proporcionada.
 * @param input - La entrada que contiene el prompt para la generación del horario de turnos.
 * @returns Una promesa que se resuelve con el horario de turnos generado.
 */
export async function suggestShiftSchedule(input: SuggestShiftScheduleInput): Promise<SuggestShiftScheduleOutput> {
  return suggestShiftScheduleFlow(input);
}

const suggestShiftSchedulePrompt = ai.definePrompt({
  name: 'suggestShiftSchedulePrompt',
  input: {schema: SuggestShiftScheduleInputSchema},
  output: {schema: SuggestShiftScheduleOutputSchema},
  prompt: `Eres un asistente de IA especializado en generar horarios de turnos para hospitales.

  Basado en los siguientes requisitos, genera un horario de turnos detallado:

  {{{prompt}}}

  Asegúrate de que el horario respete las reglas del servicio, las preferencias de los empleados y la disponibilidad.`,
});

const suggestShiftScheduleFlow = ai.defineFlow(
  {
    name: 'suggestShiftScheduleFlow',
    inputSchema: SuggestShiftScheduleInputSchema,
    outputSchema: SuggestShiftScheduleOutputSchema,
  },
  async input => {
    const {output} = await suggestShiftSchedulePrompt(input);
    return output!;
  }
);
