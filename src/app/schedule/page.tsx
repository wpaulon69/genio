"use client";

import PageHeader from '@/components/common/page-header';
import ScheduleView from '@/components/schedule/schedule-view';
import ShiftGeneratorForm from '@/components/schedule/shift-generator-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mockShifts, mockEmployees, mockServices } from '@/lib/types';
import type { Shift, Employee, Service } from '@/lib/types';
import React, { useState } from 'react';

export default function SchedulePage() {
  // In a real app, shifts would be fetched or managed via global state
  const [shifts, setShifts] = useState<Shift[]>(mockShifts);
  const [employees] = useState<Employee[]>(mockEmployees);
  const [services] = useState<Service[]>(mockServices);

  const handleScheduleGenerated = (generatedScheduleText: string) => {
    // This is a simplified handler. In a real app, you would parse
    // the generatedScheduleText and update the `shifts` state.
    // For now, we can just log it or display an alert.
    console.log("Generated Schedule:", generatedScheduleText);
    // Potentially, you could try to parse this text into Shift objects
    // and add them to the `shifts` state, then switch to the "View Schedule" tab.
    // For now, this function acts as a placeholder for further integration.
    alert("Schedule generated! Check console. (Parsing and display not yet implemented)");
  };


  return (
    <div className="container mx-auto">
      <PageHeader
        title="Shift Schedule"
        description="View current schedules and generate new ones using AI."
      />
      <Tabs defaultValue="view-schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-1/2">
          <TabsTrigger value="view-schedule">View Schedule</TabsTrigger>
          <TabsTrigger value="generate-shifts">Generate Shifts</TabsTrigger>
        </TabsList>
        <TabsContent value="view-schedule" className="mt-6">
          <ScheduleView 
            shifts={shifts} 
            employees={employees} 
            services={services} 
          />
        </TabsContent>
        <TabsContent value="generate-shifts" className="mt-6">
          <ShiftGeneratorForm onScheduleGenerated={handleScheduleGenerated} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
