// Resume un informe de utilización para identificar tendencias clave y problemas de personal para los administradores.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeShiftReportInputSchema = z.object({
  report: z.string().describe('El informe de utilización a resumir.'),
});

export type SummarizeShiftReportInput = z.infer<typeof SummarizeShiftReportInputSchema>;

const SummarizeShiftReportOutputSchema = z.object({
  summary: z.string().describe('Un resumen del informe de utilización.'),
});

export type SummarizeShiftReportOutput = z.infer<typeof SummarizeShiftReportOutputSchema>;

export async function summarizeShiftReport(input: SummarizeShiftReportInput): Promise<SummarizeShiftReportOutput> {
  return summarizeShiftReportFlow(input);
}

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

const summarizeShiftReportFlow = ai.defineFlow(
  {
    name: 'summarizeShiftReportFlow',
    inputSchema: SummarizeShiftReportInputSchema,
    outputSchema: SummarizeShiftReportOutputSchema,
  },
  async input => {
    const {output} = await summarizeShiftReportPrompt(input);
    return output!;
  }
);
