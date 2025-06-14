
"use client";

import React, { useState } from 'react';
import PageHeader from '@/components/common/page-header';
import ReportFilters from '@/components/reports/report-filters';
import ReportDisplay from '@/components/reports/report-display';
import { summarizeShiftReport, type SummarizeShiftReportInput } from '@/ai/flows/summarize-shift-report';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from 'lucide-react';
import type { Service, Employee, MonthlySchedule, EmployeeReportMetrics, EmployeeComparisonReportOutput, Holiday, ScheduleQualityReportOutput } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import { getServices } from '@/lib/firebase/services';
import { getEmployees } from '@/lib/firebase/employees';
import { getPublishedMonthlySchedule, getSchedulesInDateRange, generateScheduleKey } from '@/lib/firebase/monthlySchedules'; // Updated import
import { getGridShiftTypeFromAIShift } from '@/components/schedule/InteractiveScheduleGrid';
import { parseISO, getDay, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getHolidays } from '@/lib/firebase/holidays';


const reportMonths = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString(),
  label: format(new Date(2000, i), 'MMMM', { locale: es }),
}));

const ALL_SERVICES_VALUE_CONST = "__ALL_SERVICES_COMPARISON__";


export default function ReportsPage() {
  const [reportSummary, setReportSummary] = useState<string | null>(null);
  const [employeeComparisonOutput, setEmployeeComparisonOutput] = useState<EmployeeComparisonReportOutput | null>(null);
  const [scheduleQualityOutput, setScheduleQualityOutput] = useState<ScheduleQualityReportOutput | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const { data: services = [], isLoading: isLoadingServices, error: errorServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: getServices,
  });

  const { data: employees = [], isLoading: isLoadingEmployees, error: errorEmployees } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: getEmployees,
  });

  const { data: holidays = [], isLoading: isLoadingHolidays, error: errorHolidays } = useQuery<Holiday[]>({
    queryKey: ['holidays'],
    queryFn: getHolidays,
  });


  const handleGenerateReport = async (filters: any) => {
    setIsProcessing(true);
    setProcessingError(null);
    setReportSummary(null);
    setEmployeeComparisonOutput(null);
    setScheduleQualityOutput(null);

    if (filters.reportType === 'shiftSummary') {
      try {
        const input: SummarizeShiftReportInput = { report: filters.reportText };
        const result = await summarizeShiftReport(input);
        setReportSummary(result.summary);
      } catch (e) {
        console.error("Error generando el resumen del informe:", e);
        setProcessingError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante la generación del resumen.");
      }
    } else if (filters.reportType === 'employeeComparison') {
      try {
        const { monthFrom, yearFrom, monthTo, yearTo, serviceIdForComparison } = filters;
        if (!monthFrom || !yearFrom || !monthTo || !yearTo) {
          setProcessingError("Faltan parámetros de fecha para el informe comparativo.");
          setIsProcessing(false);
          return;
        }

        const targetServiceId = (serviceIdForComparison === ALL_SERVICES_VALUE_CONST || !serviceIdForComparison)
          ? undefined
          : serviceIdForComparison;

        // getSchedulesInDateRange will now fetch 'published' schedules
        const schedulesInRange = await getSchedulesInDateRange(yearFrom, monthFrom, yearTo, monthTo, targetServiceId);
        const metricsByEmployee: Record<string, EmployeeReportMetrics> = {};

        schedulesInRange.forEach(schedule => {
          schedule.shifts.forEach(shift => {
            const employee = employees.find(e => e.name === shift.employeeName);
            if (!employee) {
              console.warn(`Empleado "${shift.employeeName}" del turno no encontrado en la lista de empleados.`);
              return;
            }

            if (!metricsByEmployee[employee.id]) {
              metricsByEmployee[employee.id] = {
                employeeId: employee.id, employeeName: employee.name,
                totalAssignedDays: 0, workDays: 0, weekendWorkDays: 0, holidayWorkDays: 0,
                weekendRestDays: 0, restDays: 0, ptoDays: 0, sickLeaveDays: 0, compOffDays: 0, holidaysOff: 0,
                shiftsM: 0, shiftsT: 0, shiftsN: 0,
                workToRestRatio: '',
              };
            }
            const metrics = metricsByEmployee[employee.id];
            metrics.totalAssignedDays++;

            const shiftDate = parseISO(shift.date);
            const dayOfWeek = getDay(shiftDate);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isCurrentHoliday = holidays.some(h => h.date === shift.date);
            const shiftType = getGridShiftTypeFromAIShift(shift);

            if (shiftType === 'M') metrics.shiftsM++;
            else if (shiftType === 'T') metrics.shiftsT++;
            else if (shiftType === 'N') metrics.shiftsN++;

            if (['M', 'T', 'N'].includes(shiftType)) {
              metrics.workDays++;
              if (isCurrentHoliday) {
                metrics.holidayWorkDays++;
              } else if (isWeekend) {
                metrics.weekendWorkDays++;
              }
            } else if (shiftType === 'D') {
              metrics.restDays++;
              if (isWeekend) metrics.weekendRestDays++;
            } else if (shiftType === 'LAO') {
              metrics.ptoDays++;
            } else if (shiftType === 'LM') {
              metrics.sickLeaveDays++;
            } else if (shiftType === 'C') {
              metrics.compOffDays++;
            } else if (shiftType === 'F') {
              metrics.holidaysOff++;
              if (isWeekend) metrics.weekendRestDays++;
            }
          });
        });

        const reportDataArray = Object.values(metricsByEmployee).map(metrics => {
          const totalOffDays = metrics.restDays + metrics.ptoDays + metrics.sickLeaveDays + metrics.compOffDays + metrics.holidaysOff;
          metrics.workToRestRatio = `${metrics.workDays} W : ${totalOffDays} L`;
          return metrics;
        }).sort((a,b) => a.employeeName.localeCompare(b.employeeName));

        const dateFromLabel = `${reportMonths.find(m => m.value === monthFrom)?.label} ${yearFrom}`;
        const dateToLabel = `${reportMonths.find(m => m.value === monthTo)?.label} ${yearTo}`;
        
        let serviceNameForLabel = "Todos los Servicios";
        if (targetServiceId) {
            const foundService = services.find(s => s.id === targetServiceId);
            if (foundService) serviceNameForLabel = foundService.name;
        }

        setEmployeeComparisonOutput({
            reportType: 'employeeComparison',
            data: reportDataArray,
            dateRangeLabel: `${dateFromLabel} - ${dateToLabel}`,
            serviceNameLabel: serviceNameForLabel
        });

      } catch (e) {
        console.error("Error generando el informe comparativo:", e);
        setProcessingError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante la generación del informe comparativo.");
      }
    } else if (filters.reportType === 'scheduleQuality') {
      try {
        const { serviceIdForScheduleQuality, monthForScheduleQuality, yearForScheduleQuality } = filters;
        if (!serviceIdForScheduleQuality || !monthForScheduleQuality || !yearForScheduleQuality) {
          setProcessingError("Faltan parámetros de servicio, mes o año para el informe de calidad de horario.");
          setIsProcessing(false);
          return;
        }
        // getPublishedMonthlySchedule will fetch the 'published' schedule
        const publishedSchedule = await getPublishedMonthlySchedule(yearForScheduleQuality, monthForScheduleQuality, serviceIdForScheduleQuality);
        if (publishedSchedule) {
          const service = services.find(s => s.id === serviceIdForScheduleQuality);
          const monthLabel = reportMonths.find(m => m.value === monthForScheduleQuality)?.label || monthForScheduleQuality;
          setScheduleQualityOutput({
            reportType: 'scheduleQuality',
            scheduleKey: publishedSchedule.scheduleKey,
            serviceName: service?.name || 'Servicio Desconocido',
            dateLabel: `${monthLabel} ${yearForScheduleQuality}`,
            score: publishedSchedule.score,
            violations: publishedSchedule.violations,
            scoreBreakdown: publishedSchedule.scoreBreakdown,
          });
        } else {
          setProcessingError(`No se encontró un horario publicado para el servicio y fecha seleccionados.`);
        }
      } catch (e) {
        console.error("Error generando el informe de calidad de horario:", e);
        setProcessingError(e instanceof Error ? e.message : "Ocurrió un error desconocido durante la generación del informe de calidad.");
      }
    } else {
      setProcessingError(`El tipo de informe "${filters.reportType}" aún no está implementado.`);
    }
    setIsProcessing(false);
  };
  
  const isLoadingData = isLoadingServices || isLoadingEmployees || isLoadingHolidays;
  const dataError = errorServices || errorEmployees || errorHolidays;

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Informes y Analíticas"
        description="Genere informes de utilización y obtenga resúmenes impulsados por IA o análisis comparativos de horarios publicados."
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          {isLoadingData && <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto my-4" />}
          {dataError && (
            <Alert variant="destructive">
              <AlertTitle>Error al Cargar Datos para Filtros</AlertTitle>
              <AlertDescription>{dataError.message}</AlertDescription>
            </Alert>
          )}
          {!isLoadingData && !dataError && (
            <ReportFilters 
              onGenerateReport={handleGenerateReport} 
              isLoading={isProcessing}
              services={services}
              employees={employees} 
            />
          )}
        </div>
        <div className="md:col-span-2">
          {isProcessing && (
            <Alert>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <AlertTitle>Procesando Informe...</AlertTitle>
              <AlertDescription>Por favor espere mientras se genera su informe.</AlertDescription>
            </Alert>
          )}
          {processingError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{processingError}</AlertDescription>
            </Alert>
          )}
          
          <ReportDisplay 
            summary={reportSummary} 
            employeeComparisonOutput={employeeComparisonOutput}
            scheduleQualityOutput={scheduleQualityOutput}
          />

          {!isProcessing && !processingError && !reportSummary && !employeeComparisonOutput && !scheduleQualityOutput && (
             <Alert>
              <AlertTitle>Ningún Informe Generado</AlertTitle>
              <AlertDescription>Seleccione el tipo de informe y los parámetros, luego haga clic en "Generar Informe".</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
