"use client";

import React, { useState } from 'react';
import PageHeader from '@/components/common/page-header';
import ReportFilters from '@/components/reports/report-filters';
import ReportDisplay from '@/components/reports/report-display';
import { summarizeShiftReport, type SummarizeShiftReportInput } from '@/ai/flows/summarize-shift-report';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from 'lucide-react';
import { mockServices, mockEmployees } from '@/lib/types';


export default function ReportsPage() {
  const [reportSummary, setReportSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateReport = async (filters: { reportText: string; reportType: string }) => {
    // For now, we only handle 'shiftSummary' type using AI.
    // Other report types (employeeUtilization, serviceUtilization) would need actual shift data.
    if (filters.reportType === 'shiftSummary') {
      setIsLoading(true);
      setError(null);
      setReportSummary(null);
      try {
        const input: SummarizeShiftReportInput = { report: filters.reportText };
        const result = await summarizeShiftReport(input);
        setReportSummary(result.summary);
      } catch (e) {
        console.error("Error generating report summary:", e);
        setError(e instanceof Error ? e.message : "An unknown error occurred during report generation.");
      } finally {
        setIsLoading(false);
      }
    } else {
      setError(`Report type "${filters.reportType}" is not yet implemented for AI summary. Please provide raw text for 'Shift Summary'.`);
      setReportSummary(null);
    }
  };

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Reports & Analytics"
        description="Generate utilization reports and get AI-powered summaries."
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <ReportFilters 
            onGenerateReport={handleGenerateReport} 
            isLoading={isLoading}
            services={mockServices}
            employees={mockEmployees}
          />
        </div>
        <div className="md:col-span-2">
          {isLoading && (
            <Alert>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <AlertTitle>Generating Report...</AlertTitle>
              <AlertDescription>Please wait while the AI processes your request.</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {reportSummary && !isLoading && !error && (
            <ReportDisplay summary={reportSummary} />
          )}
          {!reportSummary && !isLoading && !error && (
             <Alert>
              <AlertTitle>No Report Generated</AlertTitle>
              <AlertDescription>Select report type and parameters, then click "Generate Report". For 'Shift Summary', provide text to summarize.</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
