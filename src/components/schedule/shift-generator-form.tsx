"use client";

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Loader2 } from 'lucide-react';
import { suggestShiftSchedule, type SuggestShiftScheduleInput } from '@/ai/flows/suggest-shift-schedule';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const shiftPromptSchema = z.object({
  prompt: z.string().min(50, "Prompt must be at least 50 characters long to provide enough detail for schedule generation."),
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
      prompt: `Generate a 7-day shift schedule for the Emergency service starting next Monday. 
Staff available: 
- Dr. Smith (Doctor, prefers mornings, max 40h/week)
- Nurse Johnson (Nurse, flexible, prefers 12h shifts)
- Nurse Lee (Nurse, cannot work Wednesdays)
- Tech Brown (Technician, available Mon, Tue, Fri, Sat)
Rules:
- Minimum 1 doctor and 2 nurses on duty at all times.
- 1 technician required from 8 AM to 8 PM.
- Shifts are typically 8 or 12 hours.
- Ensure adequate rest periods between shifts (min 10 hours).
- Balance workload fairly among staff.
- Consider stated preferences where possible.
Output the schedule in a clear, day-by-day, employee-by-employee format.`,
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
      console.error("Error generating schedule:", e);
      setError(e instanceof Error ? e.message : "An unknown error occurred during schedule generation.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-headline flex items-center">
          <Sparkles className="mr-2 h-6 w-6 text-primary" />
          AI Shift Generator
        </CardTitle>
        <CardDescription>
          Provide detailed requirements for the shift schedule. The AI will attempt to generate an optimal schedule based on your input.
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
                  <FormLabel>Scheduling Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the service rules, employee preferences, availability, date range, etc."
                      rows={15}
                      className="min-h-[200px] font-code text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground pt-1">
                    Be as specific as possible for best results. Include dates, staff names, roles, specific constraints, and desired output format.
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
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Schedule
                </>
              )}
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Generation Failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {generatedSchedule && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Generated Schedule Suggestion</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={generatedSchedule}
                    readOnly
                    rows={15}
                    className="min-h-[200px] font-code text-sm bg-muted/50"
                  />
                   <p className="text-xs text-muted-foreground pt-2">
                    Review the generated schedule. You may need to refine your prompt or make manual adjustments.
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
