
// src/ai/flows/suggest-shift-schedule.ts
'use server';

/**
 * @fileOverview Este archivo define un flujo de Genkit para sugerir un horario de turnos basado en un prompt.
 *
 * El flujo toma un prompt que describe los requisitos para el horario de turnos y devuelve un horario sugerido
 * en formato estructurado (array de objetos de turno) y un texto legible por humanos.
 *
 * @interface SuggestShiftScheduleInput - Define el esquema de entrada para la función suggestShiftSchedule.
 * @interface AIShift - Define la estructura de un turno devuelto por la IA (forma final y estricta).
 * @interface RawAIShift - Define una estructura más laxa de un turno como podría ser devuelto por la IA.
 * @interface SuggestShiftScheduleOutput - Define el esquema de salida para la función suggestShiftSchedule.
 * @function suggestShiftSchedule - La función principal que desencadena el flujo de generación de horarios de turnos.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestShiftScheduleInputSchema = z.object({
  prompt: z.string().describe('Un prompt detallado que describe los requisitos del horario de turnos, incluyendo reglas del servicio, preferencias de los empleados y disponibilidad.'),
});
export type SuggestShiftScheduleInput = z.infer<typeof SuggestShiftScheduleInputSchema>;

// Esquema estricto para un turno (lo que la aplicación espera al final)
const AIShiftSchema = z.object({
  date: z.string().describe('La fecha del turno en formato YYYY-MM-DD.'),
  startTime: z.string().describe('La hora de inicio del turno en formato HH:MM (24 horas).'),
  endTime: z.string().describe('La hora de finalización del turno en formato HH:MM (24 horas).'),
  employeeName: z.string().describe('El nombre completo del empleado asignado al turno.'),
  serviceName: z.string().describe('El nombre del servicio para el turno.'),
  notes: z.string().optional().describe('Cualquier nota opcional para el turno.'),
});
export type AIShift = z.infer<typeof AIShiftSchema>;

// Esquema más laxo para un turno, como podría venir directamente de la IA (para el output del prompt)
const RawAIShiftSchema = z.object({
  date: z.string().describe('La fecha del turno en formato YYYY-MM-DD.'),
  employeeName: z.string().describe('El nombre completo del empleado asignado al turno.'),
  startTime: z.string().optional().describe('La hora de inicio del turno en formato HH:MM (24 horas).'),
  endTime: z.string().optional().describe('La hora de finalización del turno en formato HH:MM (24 horas).'),
  serviceName: z.string().optional().describe('El nombre del servicio para el turno.'),
  notes: z.string().optional().describe('Cualquier nota opcional para el turno.'),
});
export type RawAIShift = z.infer<typeof RawAIShiftSchema>;


// Esquema para la SALIDA del PROMPT (usa RawAIShiftSchema y responseText opcional)
const PromptOutputSchema = z.object({
  generatedShifts: z.array(RawAIShiftSchema).optional().describe('Un array de objetos de turno generados según el prompt.'),
  responseText: z.string().optional().describe('Un resumen legible por humanos del horario generado o cualquier comentario relevante.'),
});

// Esquema para la SALIDA del FLOW (usa AIShiftSchema estricto y responseText REQUERIDO)
const FlowOutputSchema = z.object({
  generatedShifts: z.array(AIShiftSchema).describe('Un array de objetos de turno generados según el prompt.'),
  responseText: z.string().describe('Un resumen legible por humanos del horario generado o cualquier comentario relevante.'),
});
export type SuggestShiftScheduleOutput = z.infer<typeof FlowOutputSchema>;


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
  output: {schema: PromptOutputSchema}, // Usar el esquema más permisivo (PromptOutputSchema) para el output del prompt
  prompt: `Eres un asistente de IA especializado en generar horarios de turnos para hospitales.

  Basado en los siguientes requisitos, genera un horario de turnos detallado:

  {{{prompt}}}

  Asegúrate de que el horario respete las reglas del servicio, las preferencias de los empleados y la disponibilidad.

  Devuelve la respuesta en el siguiente formato JSON. El campo 'responseText' SIEMPRE debe estar presente, incluso si hay problemas.
  Cada objeto dentro de 'generatedShifts' DEBE tener todos los campos requeridos (date, startTime, endTime, employeeName, serviceName).
  Las notas son opcionales.
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
  Valida que los horarios de inicio y fin sean lógicos (endTime posterior a startTime).
  TODOS los campos (date, startTime, endTime, employeeName, serviceName) son OBLIGATORIOS para cada turno en 'generatedShifts'. El campo 'notes' es opcional.
  El campo 'responseText' en el nivel raíz del JSON es SIEMPRE OBLIGATORIO.`,
});

const suggestShiftScheduleFlow = ai.defineFlow(
  {
    name: 'suggestShiftScheduleFlow',
    inputSchema: SuggestShiftScheduleInputSchema,
    outputSchema: FlowOutputSchema, // Usar el esquema estricto (FlowOutputSchema) para la salida del flow
  },
  async (input): Promise<SuggestShiftScheduleOutput> => {
    const {output: promptOutput} = await suggestShiftSchedulePrompt(input);
    
    if (!promptOutput) {
      console.error("La IA no generó una respuesta (output es undefined/null).");
      return {
        generatedShifts: [],
        responseText: "La IA no generó una respuesta válida (output estaba vacío).",
      };
    }

    // Asegurar que rawGeneratedShifts sea un array, incluso si promptOutput.generatedShifts es undefined
    const rawGeneratedShifts: RawAIShift[] = Array.isArray(promptOutput.generatedShifts) ? promptOutput.generatedShifts : [];
    
    let responseText = (typeof promptOutput.responseText === 'string' && promptOutput.responseText.trim() !== '') 
      ? promptOutput.responseText 
      : "La IA no proporcionó un texto de respuesta o este estaba vacío.";

    // Filtrar para incluir solo turnos completos que cumplan con AIShiftSchema
    const completeShifts: AIShift[] = rawGeneratedShifts.filter(shift => 
        shift.date && typeof shift.date === 'string' &&
        shift.startTime && typeof shift.startTime === 'string' &&
        shift.endTime && typeof shift.endTime === 'string' &&
        shift.employeeName && typeof shift.employeeName === 'string' &&
        shift.serviceName && typeof shift.serviceName === 'string'
    ).map(shift => ({ // Asegurar que el objeto mapeado cumpla con AIShift
        date: shift.date!,
        startTime: shift.startTime!,
        endTime: shift.endTime!,
        employeeName: shift.employeeName!,
        serviceName: shift.serviceName!,
        notes: shift.notes, 
    }));


    if (completeShifts.length < rawGeneratedShifts.length) {
        const missingCount = rawGeneratedShifts.length - completeShifts.length;
        const warningMessage = ` (Advertencia: Se filtraron ${missingCount} turnos incompletos de la respuesta de la IA.)`;
        
        if (responseText === "La IA no proporcionó un texto de respuesta o este estaba vacío.") {
            responseText = `La IA generó datos pero faltó el texto de resumen. Además, ${missingCount} turnos estaban incompletos y fueron filtrados.`;
        } else {
            responseText += warningMessage;
        }
        console.warn(`Se filtraron ${missingCount} turnos incompletos de la respuesta de la IA. Turnos crudos:`, rawGeneratedShifts, "Turnos completos:", completeShifts);
    }
    
    return {
        generatedShifts: completeShifts,
        responseText: responseText,
    };
  }
);

