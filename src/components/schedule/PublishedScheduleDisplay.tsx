"use client";

import React from 'react';
import type { MonthlySchedule } from '@/lib/types';

interface PublishedScheduleDisplayProps {
  schedule: MonthlySchedule | null;
}

const PublishedScheduleDisplay: React.FC<PublishedScheduleDisplayProps> = ({ schedule }) => {
  if (!schedule) {
    return <div>No published schedule found.</div>;
  }

  return (
    <div>
      <h2>Published Schedule</h2>
      <p>Schedule Key: {schedule.scheduleKey}</p>
      <p>Year: {schedule.year}</p>
      <p>Month: {schedule.month}</p>
      <p>Service: {schedule.serviceName}</p>
      {/* Display other schedule details here */}
    </div>
  );
};

export default PublishedScheduleDisplay;
