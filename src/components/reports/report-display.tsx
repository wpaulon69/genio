"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain } from 'lucide-react';

interface ReportDisplayProps {
  summary: string | null;
}

export default function ReportDisplay({ summary }: ReportDisplayProps) {
  if (!summary) {
    return null; // Or a placeholder message
  }

  // Basic formatting for paragraphs (assuming AI might return newline-separated paragraphs)
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
        {/* Render summary, potentially with markdown support if AI provides it */}
        <div className="text-foreground text-base leading-relaxed">
          {formattedSummary}
        </div>
      </CardContent>
    </Card>
  );
}
