
"use client";

import type { Service } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, FilePenLine, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface ServiceListProps {
  services: Service[];
  onEdit: (service: Service) => void;
  onDelete: (serviceId: number) => void;
  isLoading?: boolean; // To disable actions while deleting
}

export default function ServiceList({ services, onEdit, onDelete, isLoading }: ServiceListProps) {
  if (services.length === 0) {
    return (
      <Card className="text-center">
        <CardHeader>
          <CardTitle>No Se Encontraron Servicios</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Aún no se han definido servicios. Haga clic en "Añadir Nuevo Servicio" para comenzar.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="hidden md:table-cell">Notas Adicionales</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id_servicio}>
                <TableCell className="font-medium">{service.nombre_servicio}</TableCell>
                <TableCell>{service.descripcion}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {service.notas_adicionales && service.notas_adicionales.trim() !== '' ? (
                    <Badge variant="outline" className="truncate max-w-xs">
                      {service.notas_adicionales.substring(0, 50)}{service.notas_adicionales.length > 50 ? '...' : ''}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground italic">N/A</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {!isLoading && <MoreHorizontal className="h-4 w-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(service)} disabled={isLoading}>
                        <FilePenLine className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(service.id_servicio)} className="text-destructive hover:!text-destructive-foreground hover:!bg-destructive" disabled={isLoading}>
                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
