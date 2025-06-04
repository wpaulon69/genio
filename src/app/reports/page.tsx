
"use client";

import React, { useState } from 'react';
import PageHeader from '@/components/common/page-header';
import ReportFilters from '@/components/reports/report-filters';
import ReportDisplay from '@/components/reports/report-display';
import { summarizeShiftReport, type SummarizeShiftReportInput } from '@/ai/flows/summarize-shift-report';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from 'lucide-react';
import type { Service, Employee } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import { getServices } from '@/lib/firebase/services';
import { getEmployees } from '@/lib/firebase/employees';


export default function ReportsPage() {
  const [reportSummary, setReportSummary] = useState<string | null>(null);
  const [isAISummarizing, setIsAISummarizing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const { data: services = [], isLoading: isLoadingServices, error: errorServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: getServices,
  });

  const { data: employees = [], isLoading: isLoadingEmployees, error: errorEmployees } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: getEmployees,
  });


  const handleGenerateReport = async (filters: { reportText: string; reportType: string }) => {
    if (filters.reportType === 'shiftSummary') {
      setIsAISummarizing(true);
      setAiError(null);
      setReportSummary(null);
      try {
        const input: SummarizeShiftReportInput = { report: filters.reportText };
        const result = await summarizeShiftReport(input);
        setReportSummary(result.summary);
      } catch (e) {
        console.error("Error generando el resumen del informe:", e);
        setAiError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante la generación del informe.");
      } finally {
        setIsAISummarizing(false);
      }
    } else {
      setAiError(`El tipo de informe "${filters.reportType}" aún no está implementado para el resumen con IA. Proporcione texto sin formato para 'Resumen de Turno'.`);
      setReportSummary(null);
    }
  };
  
  const isLoadingData = isLoadingServices || isLoadingEmployees;
  const dataError = errorServices || errorEmployees;

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Informes y Analíticas"
        description="Genere informes de utilización y obtenga resúmenes impulsados por IA."
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          {isLoadingData && <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto my-4" />}
          {dataError && (
            <Alert variant="destructive">
              <AlertTitle>Error al Cargar Filtros</AlertTitle>
              <AlertDescription>{dataError.message}</AlertDescription>
            </Alert>
          )}
          {!isLoadingData && !dataError && (
            <ReportFilters 
              onGenerateReport={handleGenerateReport} 
              isLoading={isAISummarizing}
              services={services}
              employees={employees}
            />
          )}
        </div>
        <div className="md:col-span-2">
          {isAISummarizing && (
            <Alert>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <AlertTitle>Generando Informe...</AlertTitle>
              <AlertDescription>Por favor espere mientras la IA procesa su solicitud.</AlertDescription>
            </Alert>
          )}
          {aiError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{aiError}</AlertDescription>
            </Alert>
          )}
          {reportSummary && !isAISummarizing && !aiError && (
            <ReportDisplay summary={reportSummary} />
          )}
          {!reportSummary && !isAISummarizing && !aiError && (
             <Alert>
              <AlertTitle>Ningún Informe Generado</AlertTitle>
              <AlertDescription>Seleccione el tipo de informe y los parámetros, luego haga clic en "Generar Informe". Para 'Resumen de Turno', proporcione el texto a resumir.</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

