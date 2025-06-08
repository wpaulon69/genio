
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Brain, Users, BarChartHorizontalBig } from 'lucide-react';
import type { EmployeeComparisonReportOutput } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ReportDisplayProps {
  summary?: string | null;
  employeeComparisonOutput?: EmployeeComparisonReportOutput | null;
}

export default function ReportDisplay({ summary, employeeComparisonOutput }: ReportDisplayProps) {
  if (employeeComparisonOutput) {
    const { data, dateRangeLabel, serviceNameLabel } = employeeComparisonOutput;
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="font-headline flex items-center">
            <Users className="mr-2 h-6 w-6 text-primary" />
            Análisis Comparativo de Empleados
          </CardTitle>
          <CardDescription>
            Periodo: {dateRangeLabel}. 
            {serviceNameLabel && ` Servicio: ${serviceNameLabel || 'N/A'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.length > 0 ? (
            <ScrollArea className="h-[60vh] w-full"> {/* Ajusta la altura según sea necesario */}
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="min-w-[150px]">Empleado</TableHead>
                    <TableHead className="text-center">Días Trab.</TableHead>
                    <TableHead className="text-center">FDS Trab.</TableHead>
                    <TableHead className="text-center">Fer. Trab.</TableHead>
                    <TableHead className="text-center">M</TableHead>
                    <TableHead className="text-center">T</TableHead>
                    <TableHead className="text-center">N</TableHead>
                    <TableHead className="text-center">D</TableHead>
                    <TableHead className="text-center">LAO</TableHead>
                    <TableHead className="text-center">LM</TableHead>
                    <TableHead className="text-center">C</TableHead>
                    <TableHead className="text-center">Fer. Libre</TableHead>
                    <TableHead className="text-center">Total Asig.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((empMetrics) => (
                    <TableRow key={empMetrics.employeeId}>
                      <TableCell className="font-medium">{empMetrics.employeeName}</TableCell>
                      <TableCell className="text-center">{empMetrics.workDays}</TableCell>
                      <TableCell className="text-center">{empMetrics.weekendWorkDays}</TableCell>
                      <TableCell className="text-center">{empMetrics.holidayWorkDays}</TableCell>
                      <TableCell className="text-center">{empMetrics.shiftsM}</TableCell>
                      <TableCell className="text-center">{empMetrics.shiftsT}</TableCell>
                      <TableCell className="text-center">{empMetrics.shiftsN}</TableCell>
                      <TableCell className="text-center">{empMetrics.restDays}</TableCell>
                      <TableCell className="text-center">{empMetrics.ptoDays}</TableCell>
                      <TableCell className="text-center">{empMetrics.sickLeaveDays}</TableCell>
                      <TableCell className="text-center">{empMetrics.compOffDays}</TableCell>
                      <TableCell className="text-center">{empMetrics.holidaysOff}</TableCell>
                      <TableCell className="text-center">{empMetrics.totalAssignedDays}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <p className="text-muted-foreground">No se encontraron datos de empleados para el rango y servicio seleccionados.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (summary) {
    const formattedSummary = summary.split('\n').map((paragraph, index) => (
      <p key={index} className="mb-2 last:mb-0">{paragraph}</p>
    ));
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="font-headline flex items-center">
             <Brain className="mr-2 h-6 w-6 text-primary" />
            Resumen del Informe con IA
          </CardTitle>
          <CardDescription>Este resumen fue generado por IA basándose en el texto del informe proporcionado.</CardDescription>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <div className="text-foreground text-base leading-relaxed">
            {formattedSummary}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Si no hay summary ni employeeComparisonOutput, no se muestra nada o un placeholder
  // Este caso es manejado por la página de Informes que muestra "Ningún Informe Generado"
  return null; 
}
