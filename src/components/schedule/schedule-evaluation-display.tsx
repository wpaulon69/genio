
"use client";

import type { ScheduleViolation, ScoreBreakdown } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BadgeCheck, CircleAlert, CircleHelp, ShieldCheck, HeartHandshake, Info } from 'lucide-react';

interface ScheduleEvaluationDisplayProps {
  score: number | null | undefined;
  violations: ScheduleViolation[] | null | undefined;
  scoreBreakdown: ScoreBreakdown | null | undefined;
  context?: 'generator' | 'viewer'; // Optional context for slight text variations
}

export default function ScheduleEvaluationDisplay({ score, violations, scoreBreakdown, context = 'viewer' }: ScheduleEvaluationDisplayProps) {
  const scoreToDisplay = score;
  const violationsToDisplay = violations;
  const breakdownToDisplay = scoreBreakdown;

  const noEvaluationData = scoreToDisplay === null && scoreToDisplay === undefined && // Check for both null and undefined for score
                           (!violationsToDisplay || violationsToDisplay.length === 0) &&
                           !breakdownToDisplay;
  
  // Specific handling for viewer when schedule is loaded but has no score/violations (e.g. manually created, not evaluated)
  // score being undefined usually means the schedule object itself doesn't have the score property yet.
  // score being null might mean it was evaluated to null.
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
      return null; // If all are explicitly null/empty in viewer, don't show anything unless it was `undefined` (handled above)
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
        {violationsToDisplay && violationsToDisplay.length > 0 ? (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-base hover:no-underline">
                Informe de Reglas y Preferencias ({violationsToDisplay.length} {violationsToDisplay.length === 1 ? 'incidencia' : 'incidencias'})
              </AccordionTrigger>
              <AccordionContent>
                <ScrollArea className="max-h-60">
                  <ul className="space-y-2 pt-2 pr-4">
                    {violationsToDisplay.map((v, index) => (
                      <li key={index} className={`p-3 rounded-md border ${v.severity === 'error' ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'}`}>
                        <div className="flex items-start gap-2">
                          {v.severity === 'error' ? <CircleAlert className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" /> : <CircleHelp className="h-5 w-5 mt-0.5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />}
                          <div>
                            <span className="font-semibold block">
                              {v.severity === 'error' ? 'Error: ' : 'Advertencia: '}
                              {v.rule}
                            </span>
                            {((v.category === 'serviceRule') || (v.category === 'employeeWellbeing')) &&
                               <Badge variant="outline" className={`mr-1 mt-1 text-xs ${v.category === 'serviceRule' ? 'border-blue-500 text-blue-700' : 'border-green-500 text-green-700'}`}>
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
                </ScrollArea>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : (
          (scoreToDisplay !== null && scoreToDisplay !== undefined) && ( 
              <Alert variant="default" className="mt-2">
              <BadgeCheck className="h-4 w-4"/>
              <AlertTitle>¡Excelente!</AlertTitle>
              <AlertDescription>No se encontraron incumplimientos de reglas o preferencias en este horario.</AlertDescription>
              </Alert>
          )
        )}
      </CardContent>
    </Card>
  );
}

