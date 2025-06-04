"use client";

import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CalendarIcon, BarChartBig, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import type { Service, Employee } from '@/lib/types';

const reportFilterSchema = z.object({
  reportType: z.string().min(1, "Report type is required"),
  serviceId: z.string().optional(),
  employeeId: z.string().optional(),
  dateRange: z.custom<DateRange | undefined>().optional(),
  reportText: z.string().optional(), // For AI summary input
}).refine(data => {
  if (data.reportType === 'shiftSummary' && (!data.reportText || data.reportText.trim().length < 20)) {
    return false;
  }
  return true;
}, {
  message: "Text for summarization must be at least 20 characters long.",
  path: ["reportText"], // specify the path to show the error message
});


type ReportFilterFormData = z.infer<typeof reportFilterSchema>;

interface ReportFiltersProps {
  onGenerateReport: (filters: {
    reportType: string;
    serviceId?: string;
    employeeId?: string;
    dateRange?: DateRange;
    reportText?: string;
  }) => void;
  isLoading: boolean;
  services: Service[];
  employees: Employee[];
}

export default function ReportFilters({ onGenerateReport, isLoading, services, employees }: ReportFiltersProps) {
  const form = useForm<ReportFilterFormData>({
    resolver: zodResolver(reportFilterSchema),
    defaultValues: {
      reportType: 'shiftSummary', // Default to AI summary
      reportText: `Example Shift Report for Week of July 15th:
Emergency Service:
- Dr. Smith worked 40 hours, covered 3 night shifts. Patient load was high on Monday.
- Nurse Johnson worked 36 hours, mostly day shifts. Reported equipment malfunction on Tuesday.
- Nurse Lee worked 24 hours, took Wednesday off as requested.
Cardiology Service:
- Dr. Alice covered all cardiology consults, 45 hours total.
- Tech Brown assisted in 15 procedures, worked 32 hours.
Overall: Staffing levels were adequate but some overtime was incurred in Emergency. Nurse Johnson's equipment report needs follow-up. Consider cross-training Tech Brown for basic ER tasks.`,
    },
  });

  const reportType = form.watch('reportType');

  const handleSubmit = (data: ReportFilterFormData) => {
    onGenerateReport(data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Report Options</CardTitle>
        <CardDescription>Select parameters to generate your report.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="reportType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Report Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a report type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="shiftSummary">AI Shift Report Summary</SelectItem>
                      <SelectItem value="employeeUtilization" disabled>Employee Utilization (coming soon)</SelectItem>
                      <SelectItem value="serviceUtilization" disabled>Service Utilization (coming soon)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {reportType === 'shiftSummary' && (
              <FormField
                control={form.control}
                name="reportText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Text to Summarize</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Paste or type the shift report text here for AI summarization..." 
                        rows={10}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {(reportType === 'employeeUtilization' || reportType === 'serviceUtilization') && (
              <>
                <FormField
                  control={form.control}
                  name="serviceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="All Services" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="">All Services</SelectItem>
                          {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="All Employees" /></SelectTrigger></FormControl>
                        <SelectContent>
                           <SelectItem value="">All Employees</SelectItem>
                           {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <Controller
                    control={form.control}
                    name="dateRange"
                    render={({ field }) => (
                    <FormItem className="flex flex-col">
                        <FormLabel>Date Range (Optional)</FormLabel>
                        <Popover>
                        <PopoverTrigger asChild>
                            <FormControl>
                            <Button variant="outline" className="justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value?.from ? (
                                field.value.to ? (
                                    <>{format(field.value.from, "LLL dd, y")} - {format(field.value.to, "LLL dd, y")}</>
                                ) : (
                                    format(field.value.from, "LLL dd, y")
                                )
                                ) : (
                                <span>Pick a date range</span>
                                )}
                            </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={field.value?.from}
                            selected={field.value}
                            onSelect={field.onChange}
                            numberOfMonths={2}
                            />
                        </PopoverContent>
                        </Popover>
                        <FormMessage />
                    </FormItem>
                    )}
                />
              </>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChartBig className="mr-2 h-4 w-4" />}
              Generate Report
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
