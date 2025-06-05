
// src/ai/flows/suggest-shift-schedule.ts
'use server';

/**
 * @fileOverview Este archivo define un flujo de Genkit para sugerir un horario de turnos basado en un prompt.
 *
 * El flujo toma un prompt que describe los requisitos para el horario de turnos y devuelve un horario sugerido
 * en formato estructurado (array de objetos de turno) y un texto legible por humanos.
 *
 * @interface SuggestShiftScheduleInput - Define el esquema de entrada para la función suggestShiftSchedule.
 * @interface AIShift - Define la estructura de un turno devuelto por la IA.
 * @interface SuggestShiftScheduleOutput - Define el esquema de salida para la función suggestShiftSchedule.
 * @function suggestShiftSchedule - La función principal que desencadena el flujo de generación de horarios de turnos.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestShiftScheduleInputSchema = z.object({
  prompt: z.string().describe('Un prompt detallado que describe los requisitos del horario de turnos, incluyendo reglas del servicio, preferencias de los empleados y disponibilidad.'),
});
export type SuggestShiftScheduleInput = z.infer<typeof SuggestShiftScheduleInputSchema>;

const AIShiftSchema = z.object({
  date: z.string().describe('La fecha del turno en formato YYYY-MM-DD.'),
  startTime: z.string().describe('La hora de inicio del turno en formato HH:MM (24 horas).'),
  endTime: z.string().describe('La hora de finalización del turno en formato HH:MM (24 horas).'),
  employeeName: z.string().describe('El nombre completo del empleado asignado al turno.'),
  serviceName: z.string().describe('El nombre del servicio para el turno.'),
  notes: z.string().optional().describe('Cualquier nota opcional para el turno.'),
});
export type AIShift = z.infer<typeof AIShiftSchema>;

const SuggestShiftScheduleOutputSchema = z.object({
  generatedShifts: z.array(AIShiftSchema).describe('Un array de objetos de turno generados según el prompt.'),
  responseText: z.string().describe('Un resumen legible por humanos del horario generado o cualquier comentario relevante.'),
});
export type SuggestShiftScheduleOutput = z.infer<typeof SuggestShiftScheduleOutputSchema>;

/**
 * La función principal para sugerir un horario de turnos basado en la entrada proporcionada.
 * @param input - La entrada que contiene el prompt para la generación del horario de turnos.
 * @returns Una promesa que se resuelve con el horario de turnos generado (tanto estructurado como texto).
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

  Asegúrate de que el horario respete las reglas del servicio, las preferencias de los empleados y la disponibilidad.

  Devuelve la respuesta en el siguiente formato JSON. El campo 'responseText' SIEMPRE debe estar presente, incluso si hay problemas.
  Cada objeto dentro de 'generatedShifts' DEBE tener todos los campos requeridos (date, startTime, endTime, employeeName, serviceName).
  {
    "generatedShifts": [
      {
        "date": "YYYY-MM-DD", // Fecha del turno
        "startTime": "HH:MM",  // Hora de inicio (formato 24h)
        "endTime": "HH:MM",    // Hora de finalización (formato 24h)
        "employeeName": "Nombre Apellido del Empleado", // Nombre completo del empleado
        "serviceName": "Nombre del Servicio",          // Nombre del servicio
        "notes": "Notas opcionales sobre el turno"    // Notas (opcional)
      }
      // ... más objetos de turno si son necesarios
    ],
    "responseText": "Un resumen legible por humanos del horario generado y cualquier comentario o advertencia importante. Este campo es OBLIGATORIO."
  }

  Si no puedes generar un horario válido basado en el prompt, devuelve un array generatedShifts vacío y explica el problema en responseText.
  Asegúrate de que los nombres de los empleados y servicios coincidan exactamente con los proporcionados en el prompt si se especifican.
  Calcula las fechas correctamente basándote en la fecha de inicio y duración mencionadas en el prompt.
  Valida que los horarios de inicio y fin sean lógicos (endTime posterior a startTime).`,
});

const suggestShiftScheduleFlow = ai.defineFlow(
  {
    name: 'suggestShiftScheduleFlow',
    inputSchema: SuggestShiftScheduleInputSchema,
    outputSchema: SuggestShiftScheduleOutputSchema,
  },
  async input => {
    const {output} = await suggestShiftSchedulePrompt(input);
    
    if (!output) {
      // Si la IA no devuelve nada en 'output', retornamos una estructura válida pero vacía.
      console.error("La IA no generó una respuesta (output es undefined/null).");
      return {
        generatedShifts: [],
        responseText: "La IA no generó una respuesta válida (output estaba vacío).",
      };
    }

    // Asegurarse de que generatedShifts sea siempre un array
    const generatedShifts = Array.isArray(output.generatedShifts) ? output.generatedShifts : [];
    
    // Asegurarse de que responseText siempre tenga un valor
    const responseText = typeof output.responseText === 'string' ? output.responseText : "La IA no proporcionó un texto de respuesta o era de un tipo incorrecto.";

    // Filtrar turnos incompletos para mayor robustez, aunque el prompt ya lo pide
    const completeShifts = generatedShifts.filter(shift => 
        shift.date && shift.startTime && shift.endTime && shift.employeeName && shift.serviceName
    );

    if (completeShifts.length < generatedShifts.length) {
        console.warn(`Se filtraron ${generatedShifts.length - completeShifts.length} turnos incompletos de la respuesta de la IA.`);
    }

    return {
        generatedShifts: completeShifts,
        responseText: responseText,
    };
  }
);

