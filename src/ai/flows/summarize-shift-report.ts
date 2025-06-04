// Summarizes a utilization report to identify key trends and staffing issues for administrators.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeShiftReportInputSchema = z.object({
  report: z.string().describe('The utilization report to summarize.'),
});

export type SummarizeShiftReportInput = z.infer<typeof SummarizeShiftReportInputSchema>;

const SummarizeShiftReportOutputSchema = z.object({
  summary: z.string().describe('A summary of the utilization report.'),
});

export type SummarizeShiftReportOutput = z.infer<typeof SummarizeShiftReportOutputSchema>;

export async function summarizeShiftReport(input: SummarizeShiftReportInput): Promise<SummarizeShiftReportOutput> {
  return summarizeShiftReportFlow(input);
}

const summarizeShiftReportPrompt = ai.definePrompt({
  name: 'summarizeShiftReportPrompt',
  input: {schema: SummarizeShiftReportInputSchema},
  output: {schema: SummarizeShiftReportOutputSchema},
  prompt: `You are an AI assistant helping a hospital administrator understand staff utilization.
  Please summarize the following shift report, highlighting key trends, potential staffing issues, and areas for improvement:

  Report:
  {{report}}
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
