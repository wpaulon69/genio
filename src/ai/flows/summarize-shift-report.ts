// Resume un informe de utilización para identificar tendencias clave y problemas de personal para los administradores.

'use server';
/**
 * @fileOverview Define un flujo de Genkit para resumir informes de turnos.
 * Este flujo utiliza un modelo de IA para analizar un informe de utilización de personal
 * y generar un resumen que destaque tendencias clave, problemas potenciales y áreas de mejora.
 *
 * @exports summarizeShiftReport - Función asíncrona que invoca el flujo de resumen.
 * @exports SummarizeShiftReportInput - Tipo de entrada para la función `summarizeShiftReport`.
 * @exports SummarizeShiftReportOutput - Tipo de salida de la función `summarizeShiftReport`.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

/**
 * Esquema de entrada para el flujo de resumen de informe de turno.
 * Define la estructura de datos que espera la función `summarizeShiftReport`.
 */
const SummarizeShiftReportInputSchema = z.object({
  /** El texto completo del informe de utilización de turnos que se va a resumir. */
  report: z.string().describe('El informe de utilización a resumir.'),
});

/**
 * Tipo TypeScript inferido del esquema `SummarizeShiftReportInputSchema`.
 * Representa la entrada para la función `summarizeShiftReport`.
 */
export type SummarizeShiftReportInput = z.infer<typeof SummarizeShiftReportInputSchema>;

/**
 * Esquema de salida para el flujo de resumen de informe de turno.
 * Define la estructura de datos que devuelve la función `summarizeShiftReport`.
 */
const SummarizeShiftReportOutputSchema = z.object({
  /** El resumen generado por la IA del informe de utilización. */
  summary: z.string().describe('Un resumen del informe de utilización.'),
});

/**
 * Tipo TypeScript inferido del esquema `SummarizeShiftReportOutputSchema`.
 * Representa la salida de la función `summarizeShiftReport`.
 */
export type SummarizeShiftReportOutput = z.infer<typeof SummarizeShiftReportOutputSchema>;

/**
 * Función principal que invoca el flujo de Genkit para resumir un informe de turno.
 *
 * @async
 * @param {SummarizeShiftReportInput} input - El objeto de entrada que contiene el informe a resumir.
 * @returns {Promise<SummarizeShiftReportOutput>} Una promesa que se resuelve con el resumen generado.
 */
export async function summarizeShiftReport(input: SummarizeShiftReportInput): Promise<SummarizeShiftReportOutput> {
  return summarizeShiftReportFlow(input);
}

/**
 * Define el prompt de Genkit para la tarea de resumen.
 * Configura el modelo de IA, los esquemas de entrada/salida y el texto del prompt.
 */
const summarizeShiftReportPrompt = ai.definePrompt({
  name: 'summarizeShiftReportPrompt',
  input: {schema: SummarizeShiftReportInputSchema},
  output: {schema: SummarizeShiftReportOutputSchema},
  prompt: `Eres un asistente de IA que ayuda a un administrador de hospital a comprender la utilización del personal.
  Por favor, resume el siguiente informe de turno, destacando tendencias clave, posibles problemas de personal y áreas de mejora:

  Informe:
  {{{report}}}
  `,
});

/**
 * Define el flujo de Genkit (`summarizeShiftReportFlow`).
 * Este flujo toma la entrada, la pasa al prompt definido y devuelve la salida del modelo de IA.
 */
const summarizeShiftReportFlow = ai.defineFlow(
  {
    name: 'summarizeShiftReportFlow',
    inputSchema: SummarizeShiftReportInputSchema,
    outputSchema: SummarizeShiftReportOutputSchema,
  },
  async input => {
    // Invoca el prompt de IA con la entrada proporcionada.
    const {output} = await summarizeShiftReportPrompt(input);
    // Retorna la salida del prompt (el resumen). El '!' asegura que output no es null/undefined.
    return output!;
  }
);
