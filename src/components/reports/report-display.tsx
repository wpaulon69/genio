
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Brain, Users, BarChartHorizontalBig, LineChart, PieChartIcon, CheckCircle, ShieldCheck, HeartHandshake, BadgeCheck, CircleAlert, CircleHelp } from 'lucide-react';
import type { EmployeeComparisonReportOutput, EmployeeReportMetrics, ScheduleQualityReportOutput, ScheduleViolation } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';

interface ReportDisplayProps {
  summary?: string | null;
  employeeComparisonOutput?: EmployeeComparisonReportOutput | null;
  scheduleQualityOutput?: ScheduleQualityReportOutput | null;
}

export default function ReportDisplay({ summary, employeeComparisonOutput, scheduleQualityOutput }: ReportDisplayProps) {
  if (scheduleQualityOutput) {
    const { serviceName, dateLabel, score, violations, scoreBreakdown } = scheduleQualityOutput;
    const scoreValue = score ?? 0;
    const serviceRulesScore = scoreBreakdown?.serviceRules ?? 0;
    const employeeWellbeingScore = scoreBreakdown?.employeeWellbeing ?? 0;

    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="font-headline flex items-center">
            <CheckCircle className="mr-2 h-6 w-6 text-primary" />
            Análisis de Calidad del Horario
          </CardTitle>
          <CardDescription>
            Servicio: {serviceName} - Periodo: {dateLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center">
                <BadgeCheck className="mr-2 h-5 w-5 text-green-600"/>
                Puntuación General del Horario
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-6">
              <span className={`text-6xl font-bold ${scoreValue >= 80 ? 'text-green-600' : scoreValue >= 60 ? 'text-yellow-500' : 'text-red-600'}`}>
                {scoreValue.toFixed(0)}
              </span>
              <span className="text-3xl text-muted-foreground ml-1">/ 100</span>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <ShieldCheck className="mr-2 h-5 w-5 text-blue-600"/>
                  Cumplimiento Reglas Servicio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-2">
                <Progress value={serviceRulesScore} className="h-3" indicatorClassName={
                    serviceRulesScore >= 80 ? 'bg-blue-600' : serviceRulesScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                }/>
                <p className="text-right text-sm font-medium">{serviceRulesScore.toFixed(0)} / 100</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <HeartHandshake className="mr-2 h-5 w-5 text-pink-600"/>
                   Bienestar del Personal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-2">
                 <Progress value={employeeWellbeingScore} className="h-3" indicatorClassName={
                     employeeWellbeingScore >= 80 ? 'bg-pink-600' : employeeWellbeingScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                 } />
                <p className="text-right text-sm font-medium">{employeeWellbeingScore.toFixed(0)} / 100</p>
              </CardContent>
            </Card>
          </div>
          
          {violations && violations.length > 0 ? (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  Detalle de Incidencias ({violations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="violations-list">
                    <AccordionTrigger className="hover:no-underline">Ver lista de incidencias</AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="max-h-72">
                        <ul className="space-y-3 pt-2 pr-3">
                          {violations.map((v, index) => (
                            <li key={index} className={`p-3 rounded-md border ${v.severity === 'error' ? 'border-destructive/60 bg-destructive/10 text-destructive-foreground/90' : 'border-yellow-500/60 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'}`}>
                              <div className="flex items-start gap-3">
                                {v.severity === 'error' ? <CircleAlert className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" /> : <CircleHelp className="h-5 w-5 mt-0.5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />}
                                <div>
                                  <span className="font-semibold block">
                                    {v.severity === 'error' ? 'Error: ' : 'Advertencia: '}
                                    {v.rule}
                                  </span>
                                  {(v.category) &&
                                     <Badge variant="outline" className={`mr-1 mt-1 text-xs ${v.category === 'serviceRule' ? 'border-blue-500 text-blue-600' : 'border-pink-500 text-pink-600'}`}>
                                      {v.category === 'serviceRule' ? 'Regla Servicio' : 'Bienestar Personal'}
                                     </Badge>
                                  }
                                  <p className="text-xs opacity-80 mt-1">
                                    {v.employeeName && <><strong>Empleado:</strong> {v.employeeName} </>}
                                    {v.date && <><strong>Fecha:</strong> {v.date} </>}
                                    {v.shiftType && v.shiftType !== 'General' && <><strong>Turno:</strong> {v.shiftType} </>}
                                  </p>
                                  <p className="text-sm mt-1.5">{v.details}</p>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ) : (
            score !== null && score !== undefined && (
                <Alert variant="default" className="mt-3">
                <BadgeCheck className="h-4 w-4 text-green-600"/>
                <AlertTitle className="text-green-700">¡Horario Óptimo!</AlertTitle>
                <AlertDescription>No se encontraron incumplimientos de reglas o preferencias en este horario.</AlertDescription>
                </Alert>
            )
          )}
           {score === null && score === undefined && (!violations || violations.length === 0) && (
             <Alert variant="default" className="mt-3">
                <BadgeCheck className="h-4 w-4 text-muted-foreground"/>
                <AlertTitle>Sin Evaluación</AlertTitle>
                <AlertDescription>Este horario no tiene datos de evaluación disponibles.</AlertDescription>
                </Alert>
           )}


        </CardContent>
      </Card>
    );
  }


  if (employeeComparisonOutput) {
    const { data, dateRangeLabel, serviceNameLabel } = employeeComparisonOutput;

    const workDaysChartConfig = {
      workDays: { label: "Días Trabajados", color: "hsl(var(--chart-1))" },
    } satisfies ChartConfig;

    const shiftTypesChartConfig = {
      shiftsM: { label: "Mañana", color: "hsl(var(--chart-2))" },
      shiftsT: { label: "Tarde", color: "hsl(var(--chart-3))" },
      shiftsN: { label: "Noche", color: "hsl(var(--chart-4))" },
    } satisfies ChartConfig;
    
    const leaveTypesChartConfig = {
      restDays: { label: "Descanso (D)", color: "hsl(var(--chart-1))" },
      ptoDays: { label: "LAO", color: "hsl(var(--chart-2))" },
      sickLeaveDays: { label: "LM", color: "hsl(var(--chart-3))" },
      compOffDays: { label: "Franco Comp. (C)", color: "hsl(var(--chart-4))" },
      holidaysOff: { label: "Feriado Libre (F)", color: "hsl(var(--chart-5))" },
    } satisfies ChartConfig;


    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="font-headline flex items-center">
            <LineChart className="mr-2 h-6 w-6 text-primary" />
            Resultados del Análisis Comparativo
          </CardTitle>
          <CardDescription>
            Periodo: {dateRangeLabel}.
            {serviceNameLabel && ` Servicio: ${serviceNameLabel}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {data.length > 0 ? (
            <>
              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center">
                  <BarChartHorizontalBig className="mr-2 h-5 w-5 text-muted-foreground" />
                  Total Días Trabajados por Empleado
                </h3>
                <ChartContainer config={workDaysChartConfig} className="min-h-[250px] w-full">
                  <BarChart 
                    accessibilityLayer 
                    data={data} 
                    layout="vertical" 
                    margin={{ left: 20, right: 20, top: 5, bottom: 5 }}
                    barSize={data.length > 10 ? 15 : 20}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <YAxis
                      dataKey="employeeName"
                      type="category"
                      tickLine={false}
                      tickMargin={5}
                      axisLine={false}
                      tickFormatter={(value: string) => value.length > 20 ? value.slice(0, 18) + '...' : value}
                      className="text-xs fill-muted-foreground"
                      interval={0}
                      width={120}
                    />
                    <XAxis dataKey="workDays" type="number" hide />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                      content={<ChartTooltipContent indicator="dot" hideLabel />}
                    />
                    <Bar dataKey="workDays" layout="vertical" radius={4} fill="var(--color-workDays)" />
                  </BarChart>
                </ChartContainer>
              </div>

              <Separator />

              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center">
                  <PieChartIcon className="mr-2 h-5 w-5 text-muted-foreground" />
                  Distribución de Tipos de Turno (M, T, N)
                </h3>
                <ChartContainer config={shiftTypesChartConfig} className="min-h-[250px] w-full">
                  <BarChart 
                    accessibilityLayer 
                    data={data} 
                    layout="vertical" 
                    margin={{ left: 20, right: 20, top: 5, bottom: 20 }} 
                    barCategoryGap="20%"
                    barSize={data.length > 10 ? 15 : 20}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <YAxis
                      dataKey="employeeName"
                      type="category"
                      tickLine={false}
                      tickMargin={5}
                      axisLine={false}
                      tickFormatter={(value: string) => value.length > 20 ? value.slice(0, 18) + '...' : value}
                      className="text-xs fill-muted-foreground"
                      interval={0}
                      width={120}
                    />
                    <XAxis type="number" hide />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                      content={<ChartTooltipContent indicator="dot" />}
                    />
                    <Legend content={<ChartLegendContent nameKey="name" />} verticalAlign="bottom" wrapperStyle={{paddingTop: '10px'}} />
                    <Bar dataKey="shiftsM" name="Mañana" stackId="shifts" fill="var(--color-shiftsM)" radius={3}/>
                    <Bar dataKey="shiftsT" name="Tarde" stackId="shifts" fill="var(--color-shiftsT)" radius={3}/>
                    <Bar dataKey="shiftsN" name="Noche" stackId="shifts" fill="var(--color-shiftsN)" radius={3}/>
                  </BarChart>
                </ChartContainer>
              </div>
              
              <Separator />
               <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center">
                  <PieChartIcon className="mr-2 h-5 w-5 text-muted-foreground" />
                  Distribución de Días No Trabajados
                </h3>
                <ChartContainer config={leaveTypesChartConfig} className="min-h-[250px] w-full">
                  <BarChart 
                    accessibilityLayer 
                    data={data} 
                    layout="vertical" 
                    margin={{ left: 20, right: 20, top: 5, bottom: 20 }} 
                    barCategoryGap="20%"
                    barSize={data.length > 10 ? 15 : 20}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <YAxis
                      dataKey="employeeName"
                      type="category"
                      tickLine={false}
                      tickMargin={5}
                      axisLine={false}
                      tickFormatter={(value: string) => value.length > 20 ? value.slice(0, 18) + '...' : value}
                      className="text-xs fill-muted-foreground"
                      interval={0}
                      width={120}
                    />
                    <XAxis type="number" hide />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                      content={<ChartTooltipContent indicator="dot" />}
                    />
                    <Legend content={<ChartLegendContent nameKey="name" />} verticalAlign="bottom" wrapperStyle={{paddingTop: '10px'}} />
                    <Bar dataKey="restDays" name="Descanso (D)" stackId="leaves" fill="var(--color-restDays)" radius={3}/>
                    <Bar dataKey="ptoDays" name="LAO" stackId="leaves" fill="var(--color-ptoDays)" radius={3}/>
                    <Bar dataKey="sickLeaveDays" name="LM" stackId="leaves" fill="var(--color-sickLeaveDays)" radius={3}/>
                    <Bar dataKey="compOffDays" name="Franco Comp. (C)" stackId="leaves" fill="var(--color-compOffDays)" radius={3}/>
                    <Bar dataKey="holidaysOff" name="Feriado Libre (F)" stackId="leaves" fill="var(--color-holidaysOff)" radius={3}/>
                  </BarChart>
                </ChartContainer>
              </div>

              <Separator />

              <div>
                <h3 className="text-lg font-semibold mb-2 mt-6 flex items-center">
                  <Users className="mr-2 h-5 w-5 text-muted-foreground" />
                  Datos Detallados por Empleado
                </h3>
                <ScrollArea className="h-[60vh] w-full">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="min-w-[150px] font-semibold">Empleado</TableHead>
                        <TableHead className="text-center">Total Asig.</TableHead>
                        <TableHead className="text-center text-green-600">D.Trab.</TableHead>
                        <TableHead className="text-center text-green-600">FDS Trab.</TableHead>
                        <TableHead className="text-center text-green-600">Fer. Trab.</TableHead>
                        <TableHead className="text-center text-orange-600">FDS Desc.</TableHead>
                        <TableHead className="text-center text-blue-600">M</TableHead>
                        <TableHead className="text-center text-blue-600">T</TableHead>
                        <TableHead className="text-center text-blue-600">N</TableHead>
                        <TableHead className="text-center text-orange-600">D</TableHead>
                        <TableHead className="text-center text-purple-600">LAO</TableHead>
                        <TableHead className="text-center text-purple-600">LM</TableHead>
                        <TableHead className="text-center text-purple-600">C</TableHead>
                        <TableHead className="text-center text-purple-600">F</TableHead>
                        <TableHead className="text-center text-gray-600">Trabajo/Libre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data as EmployeeReportMetrics[]).map((empMetrics) => (
                        <TableRow key={empMetrics.employeeId}>
                          <TableCell className="font-medium">{empMetrics.employeeName}</TableCell>
                          <TableCell className="text-center">{empMetrics.totalAssignedDays}</TableCell>
                          <TableCell className="text-center font-semibold text-green-700">{empMetrics.workDays}</TableCell>
                          <TableCell className="text-center">{empMetrics.weekendWorkDays}</TableCell>
                          <TableCell className="text-center">{empMetrics.holidayWorkDays}</TableCell>
                          <TableCell className="text-center">{empMetrics.weekendRestDays}</TableCell>
                          <TableCell className="text-center">{empMetrics.shiftsM}</TableCell>
                          <TableCell className="text-center">{empMetrics.shiftsT}</TableCell>
                          <TableCell className="text-center">{empMetrics.shiftsN}</TableCell>
                          <TableCell className="text-center">{empMetrics.restDays}</TableCell>
                          <TableCell className="text-center">{empMetrics.ptoDays}</TableCell>
                          <TableCell className="text-center">{empMetrics.sickLeaveDays}</TableCell>
                          <TableCell className="text-center">{empMetrics.compOffDays}</TableCell>
                          <TableCell className="text-center">{empMetrics.holidaysOff}</TableCell>
                          <TableCell className="text-center">{empMetrics.workToRestRatio}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </>
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

  return null;
}

    