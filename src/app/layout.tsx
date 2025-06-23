
"use client"; // Required for QueryClientProvider

import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import AppShell from '@/components/layout/app-shell';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'; // Optional: for dev tools
import React from 'react'; // Import React for useState

// export const metadata: Metadata = { // Metadata can't be used in a client component directly
//   title: 'ShiftFlow',
//   description: 'Planificación Inteligente de Turnos para Hospitales',
// };
// If you need dynamic metadata with client components, consider using the `metadata` export in child server components or page.tsx

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Create a new QueryClient instance for each request to avoid sharing data between users.
  // If you're not using SSR/SSG extensively with data prefetching, a single instance might be fine,
  // but this is safer for server-rendered scenarios.
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: false, // Optional: disable refetch on window focus
      },
    },
  }));

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <title>ShiftFlow</title>
        <meta name="description" content="Planificación Inteligente de Turnos para Hospitales" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <QueryClientProvider client={queryClient}>
          <AppShell>
            {children}
          </AppShell>
          <Toaster />
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </body>
    </html>
  );
}
