import type React from 'react';

/**
 * Props para el componente `PageHeader`.
 */
interface PageHeaderProps {
  /** El título principal de la página o sección. */
  title: string;
  /** Una descripción opcional o subtítulo que aparece debajo del título principal. */
  description?: string;
  /** Nodos React opcionales para acciones, como botones, que se mostrarán a la derecha del título. */
  actions?: React.ReactNode;
}

/**
 * Componente `PageHeader` reutilizable para mostrar un título de página estándar,
 * una descripción opcional y un conjunto de acciones (como botones).
 *
 * @param {PageHeaderProps} props - Las props del componente.
 * @returns {JSX.Element} El elemento JSX que representa el encabezado de la página.
 */
export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
