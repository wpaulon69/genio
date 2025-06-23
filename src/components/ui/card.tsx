
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Componente `Card` base. Actúa como contenedor principal para el contenido de la tarjeta.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Props estándar de HTML div.
 * @param {React.Ref<HTMLDivElement>} ref - Ref para el elemento div subyacente.
 * @returns {JSX.Element} El elemento JSX de la tarjeta.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

/**
 * Componente `CardHeader`. Se utiliza para la sección de encabezado de una tarjeta.
 * Típicamente contiene `CardTitle` y `CardDescription`.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Props estándar de HTML div.
 * @param {React.Ref<HTMLDivElement>} ref - Ref para el elemento div subyacente.
 * @returns {JSX.Element} El elemento JSX del encabezado de la tarjeta.
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

/**
 * Componente `CardTitle`. Se utiliza para mostrar el título principal dentro de un `CardHeader`.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Props estándar de HTML div, pero renderiza un h3 semánticamente.
 * @param {React.Ref<HTMLDivElement>} ref - Ref para el elemento div (que actúa como h3) subyacente.
 * @returns {JSX.Element} El elemento JSX del título de la tarjeta.
 */
const CardTitle = React.forwardRef<
  HTMLDivElement, // Debería ser HTMLHeadingElement si se usara <h3> directamente, pero ShadCN usa <div> con role/aria.
  React.HTMLAttributes<HTMLDivElement> // Similarmente, sería HTMLHeadingElement.
>(({ className, ...props }, ref) => (
  <div // ShadCN a menudo usa <div> estilizado como encabezado por flexibilidad.
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight", // Estilos de título
      className
    )}
    // role="heading" aria-level="3" // Para mejorar semántica si es un div.
    {...props}
  />
))
CardTitle.displayName = "CardTitle"


/**
 * Componente `CardDescription`. Se utiliza para mostrar una descripción o subtítulo
 * dentro de un `CardHeader`, usualmente debajo de `CardTitle`.
 *
 * @param {React.HTMLAttributes<HTMLParagraphElement>} props - Props estándar de HTML p.
 * @param {React.Ref<HTMLParagraphElement>} ref - Ref para el elemento p subyacente.
 * @returns {JSX.Element} El elemento JSX de la descripción de la tarjeta.
 */
const CardDescription = React.forwardRef<
  HTMLDivElement, // ShadCN usa <div> para esto también
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"


/**
 * Componente `CardContent`. Se utiliza para la sección principal de contenido de una tarjeta.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Props estándar de HTML div.
 * @param {React.Ref<HTMLDivElement>} ref - Ref para el elemento div subyacente.
 * @returns {JSX.Element} El elemento JSX del contenido de la tarjeta.
 */
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

/**
 * Componente `CardFooter`. Se utiliza para la sección de pie de página de una tarjeta.
 * Típicamente contiene acciones o información secundaria.
 *
 * @param {React.HTMLAttributes<HTMLDivElement>} props - Props estándar de HTML div.
 * @param {React.Ref<HTMLDivElement>} ref - Ref para el elemento div subyacente.
 * @returns {JSX.Element} El elemento JSX del pie de página de la tarjeta.
 */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
