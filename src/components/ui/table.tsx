
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Contenedor principal de la tabla.
 * Se renderiza como un `div` que envuelve un elemento `<table>`.
 * Se ha modificado para quitar `overflow-auto` y permitir que `ScrollArea` lo maneje.
 *
 * @param {React.HTMLAttributes<HTMLTableElement>} props - Props estándar de HTML table.
 * @param {React.Ref<HTMLTableElement>} ref - Ref para el elemento table subyacente.
 * @returns {JSX.Element} El elemento JSX de la tabla.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, children, ...props }, ref) => {
  // Filter out any children that are just whitespace or null/undefined
  // to prevent hydration errors with <table>.
  const validChildren = React.Children.toArray(children).filter(child => {
    if (React.isValidElement(child)) {
      return true;
    }
    // Filter out strings that are only whitespace
    if (typeof child === 'string' && child.trim() === '') {
      return false;
    }
    // Keep other primitive children like numbers if any, but filter null/undefined.
    // This also effectively keeps non-empty strings.
    return child != null;
  });

  return (
    // Modificado: removido overflow-auto. ScrollArea lo manejará.
    <div className="relative w-full"> 
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      >{validChildren}</table>
    </div>
  );
});
Table.displayName = "Table"

/**
 * Encabezado de la tabla (`<thead>`).
 * Contiene `TableRow` con celdas `TableHead`.
 *
 * @param {React.HTMLAttributes<HTMLTableSectionElement>} props - Props estándar de HTML thead.
 * @param {React.Ref<HTMLTableSectionElement>} ref - Ref para el elemento thead subyacente.
 * @returns {JSX.Element} El elemento JSX del encabezado de la tabla.
 */
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

/**
 * Cuerpo de la tabla (`<tbody>`).
 * Contiene filas (`TableRow`) con celdas de datos (`TableCell`).
 *
 * @param {React.HTMLAttributes<HTMLTableSectionElement>} props - Props estándar de HTML tbody.
 * @param {React.Ref<HTMLTableSectionElement>} ref - Ref para el elemento tbody subyacente.
 * @returns {JSX.Element} El elemento JSX del cuerpo de la tabla.
 */
const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

/**
 * Pie de la tabla (`<tfoot>`).
 * Puede usarse para resúmenes o totales.
 *
 * @param {React.HTMLAttributes<HTMLTableSectionElement>} props - Props estándar de HTML tfoot.
 * @param {React.Ref<HTMLTableSectionElement>} ref - Ref para el elemento tfoot subyacente.
 * @returns {JSX.Element} El elemento JSX del pie de la tabla.
 */
const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

/**
 * Fila de la tabla (`<tr>`).
 * Se usa tanto en `TableHeader` como en `TableBody` y `TableFooter`.
 *
 * @param {React.HTMLAttributes<HTMLTableRowElement>} props - Props estándar de HTML tr.
 * @param {React.Ref<HTMLTableRowElement>} ref - Ref para el elemento tr subyacente.
 * @returns {JSX.Element} El elemento JSX de la fila de la tabla.
 */
const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
    <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />));
TableRow.displayName = "TableRow"

/**
 * Celda de encabezado de la tabla (`<th>`).
 * Se usa dentro de una `TableRow` en `TableHeader`.
 *
 * @param {React.ThHTMLAttributes<HTMLTableCellElement>} props - Props estándar de HTML th.
 * @param {React.Ref<HTMLTableCellElement>} ref - Ref para el elemento th subyacente.
 * @returns {JSX.Element} El elemento JSX de la celda de encabezado.
 */
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

/**
 * Celda de datos de la tabla (`<td>`).
 * Se usa dentro de una `TableRow` en `TableBody`.
 *
 * @param {React.TdHTMLAttributes<HTMLTableCellElement>} props - Props estándar de HTML td.
 * @param {React.Ref<HTMLTableCellElement>} ref - Ref para el elemento td subyacente.
 * @returns {JSX.Element} El elemento JSX de la celda de datos.
 */
const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

/**
 * Título o leyenda de la tabla (`<caption>`).
 * Describe el contenido de la tabla.
 *
 * @param {React.HTMLAttributes<HTMLTableCaptionElement>} props - Props estándar de HTML caption.
 * @param {React.Ref<HTMLTableCaptionElement>} ref - Ref para el elemento caption subyacente.
 * @returns {JSX.Element} El elemento JSX del título de la tabla.
 */
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
