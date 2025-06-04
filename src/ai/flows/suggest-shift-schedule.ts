// src/ai/flows/suggest-shift-schedule.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting a shift schedule based on a prompt.
 *
 * The flow takes a prompt describing the requirements for the shift schedule and returns a suggested schedule.
 * It uses the ai.generate function to generate the shift schedule based on the prompt.
 *
 * @interface SuggestShiftScheduleInput - Defines the input schema for the suggestShiftSchedule function.
 * @interface SuggestShiftScheduleOutput - Defines the output schema for the suggestShiftSchedule function.
 * @function suggestShiftSchedule - The main function that triggers the shift schedule generation flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestShiftScheduleInputSchema = z.object({
  prompt: z.string().describe('A detailed prompt describing the shift schedule requirements, including service rules, employee preferences, and availability.'),
});
export type SuggestShiftScheduleInput = z.infer<typeof SuggestShiftScheduleInputSchema>;

const SuggestShiftScheduleOutputSchema = z.object({
  schedule: z.string().describe('The generated shift schedule in a human-readable format.'),
});
export type SuggestShiftScheduleOutput = z.infer<typeof SuggestShiftScheduleOutputSchema>;

/**
 * The main function to suggest a shift schedule based on the provided input.
 * @param input - The input containing the prompt for shift schedule generation.
 * @returns A promise resolving to the generated shift schedule.
 */
export async function suggestShiftSchedule(input: SuggestShiftScheduleInput): Promise<SuggestShiftScheduleOutput> {
  return suggestShiftScheduleFlow(input);
}

const suggestShiftSchedulePrompt = ai.definePrompt({
  name: 'suggestShiftSchedulePrompt',
  input: {schema: SuggestShiftScheduleInputSchema},
  output: {schema: SuggestShiftScheduleOutputSchema},
  prompt: `You are an AI assistant specialized in generating shift schedules for hospitals.

  Based on the following requirements, generate a detailed shift schedule:

  {{{prompt}}}

  Ensure the schedule respects service rules, employee preferences, and availability.`,
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
