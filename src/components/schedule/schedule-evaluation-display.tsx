
"use client";

import type { ScheduleViolation, ScoreBreakdown } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// ScrollArea ya no se usa aquí directamente para la lista de violaciones
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BadgeCheck, CircleAlert, CircleHelp, ShieldCheck, HeartHandshake, Info } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface ScheduleEvaluationDisplayProps {
  score: number | null | undefined;
  violations: ScheduleViolation[] | null | undefined;
  scoreBreakdown: ScoreBreakdown | null | undefined;
  context?: 'generator' | 'viewer'; 
}

export default function ScheduleEvaluationDisplay({ score, violations, scoreBreakdown, context = 'viewer' }: ScheduleEvaluationDisplayProps) {
  const scoreToDisplay = score;
  const violationsToDisplay = violations;
  const breakdownToDisplay = scoreBreakdown;

  const noEvaluationData = scoreToDisplay === null && scoreToDisplay === undefined &&
                           (!violationsToDisplay || violationsToDisplay.length === 0) &&
                           !breakdownToDisplay;
  
  if (context === 'viewer' && score === undefined && (!violations || violations.length === 0) && !scoreBreakdown) {
    return (
      <Card className="mt-6 w-full border-dashed">
        <CardHeader className="pb-3 pt-5">
          <CardTitle className="text-lg flex items-center">
            <Info className="mr-2 h-5 w-5 text-muted-foreground" />
            Evaluación del Horario
          </CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">No hay datos de evaluación (puntuación/violaciones) disponibles para este horario.</p>
        </CardContent>
      </Card>
    );
  }
  
  if (noEvaluationData && context === 'generator') { 
      return null; 
  }
  if (scoreToDisplay === null && (!violationsToDisplay || violationsToDisplay.length === 0) && !breakdownToDisplay && context === 'viewer') {
      return null; 
  }


  return (
    <Card className="mt-6 w-full border-dashed">
      <CardHeader className="pb-3 pt-5">
        <CardTitle className="text-lg flex items-center">
          <BadgeCheck className="mr-2 h-5 w-5 text-primary" />
          Evaluación del Horario
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-3">
        {scoreToDisplay !== null && scoreToDisplay !== undefined && (
          <div className="text-base font-semibold">
            Puntuación General: <Badge variant={scoreToDisplay >= 80 ? "default" : scoreToDisplay >= 60 ? "secondary" : "destructive"}>{scoreToDisplay.toFixed(0)} / 100</Badge>
          </div>
        )}
        {breakdownToDisplay && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-1 mb-3">
              <div className="flex items-center">
                  <ShieldCheck className="mr-2 h-5 w-5 text-blue-600"/>
                  <span>Cumplimiento Reglas Servicio:</span>
                  <Badge variant={breakdownToDisplay.serviceRules >= 80 ? "default" : breakdownToDisplay.serviceRules >= 60 ? "secondary" : "destructive"} className="ml-auto md:ml-2">{breakdownToDisplay.serviceRules.toFixed(0)} / 100</Badge>
              </div>
              <div className="flex items-center">
                  <HeartHandshake className="mr-2 h-5 w-5 text-green-600"/>
                  <span>Bienestar del Personal:</span>
                  <Badge variant={breakdownToDisplay.employeeWellbeing >= 80 ? "default" : breakdownToDisplay.employeeWellbeing >= 60 ? "secondary" : "destructive"} className="ml-auto md:ml-2">{breakdownToDisplay.employeeWellbeing.toFixed(0)} / 100</Badge>
              </div>
          </div>
        )}
        
        {(scoreToDisplay !== null && scoreToDisplay !== undefined) && (breakdownToDisplay || (violationsToDisplay && violationsToDisplay.length > 0)) && <Separator className="my-3" />}

        {violationsToDisplay && violationsToDisplay.length > 0 ? (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  Detalle de Incidencias ({violationsToDisplay.length})
                </CardTitle>
              </CardHeader>
              <CardContent> {/* Este CardContent tiene p-6 pt-0 por defecto */}
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="violations-list">
                    <AccordionTrigger className="hover:no-underline">Ver lista de incidencias</AccordionTrigger>
                    {/* Aplicamos clases de scroll y padding al AccordionContent.
                        Esto hará que el div interno del AccordionContent sea el que tenga scroll.
                        Usamos max-h-72 (288px) y p-3 (12px padding).
                    */}
                    <AccordionContent className="max-h-72 overflow-y-auto p-3">
                      <ul className="space-y-3"> {/* ul ya no necesita padding propio aquí */}
                        {violationsToDisplay.map((v, index) => (
                          <li key={index} className={`p-3 rounded-md border ${v.severity === 'error' ? 'border-destructive/60 bg-destructive/10 text-destructive-foreground/90' : 'border-yellow-500/60 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'}`}>
                            <div className="flex items-start gap-2">
                              {v.severity === 'error' ? <CircleAlert className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" /> : <CircleHelp className="h-5 w-5 mt-0.5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />}
                              <div>
                                <span className="font-semibold block">
                                  {v.severity === 'error' ? 'Error: ' : 'Advertencia: '}
                                  {v.rule}
                                </span>
                                {((v.category === 'serviceRule') || (v.category === 'employeeWellbeing')) &&
                                   <Badge
                                      className={cn(
                                        "mr-1 mt-1 text-xs px-2 py-0.5 rounded-md border font-medium", // Asegura padding y borde base
                                        v.category === 'serviceRule'
                                          ? "bg-primary/20 text-primary-foreground border-primary/40"
                                          : "bg-accent/20 text-accent-foreground border-accent/40"
                                      )}
                                    >
                                      {v.category === 'serviceRule' ? 'Regla Servicio' : 'Bienestar Personal'}
                                   </Badge>
                                }
                                <p className="text-xs opacity-90 mt-1">
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
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ) : (
            (scoreToDisplay !== null && scoreToDisplay !== undefined) && ( 
                <Alert variant="default" className="mt-2">
                <BadgeCheck className="h-4 w-4"/>
                <AlertTitle>¡Excelente!</AlertTitle>
                <AlertDescription>No se encontraron incumplimientos de reglas o preferencias en este horario.</AlertDescription>
                </Alert>
            )
          )}
         {scoreToDisplay === null && scoreToDisplay === undefined && (!violationsToDisplay || violationsToDisplay.length === 0) && !breakdownToDisplay && context === 'generator' && (
           <Alert variant="default" className="mt-2">
              <Info className="h-4 w-4"/>
              <AlertTitle>Evaluación no Disponible</AlertTitle>
              <AlertDescription>Los datos de evaluación para este horario generado no están disponibles o no se han calculado aún.</AlertDescription>
           </Alert>
        )}
      </CardContent>
    </Card>
  );
}

