
"use client";

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Service } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const serviceSchema = z.object({
  name: z.string().min(1, "El nombre del servicio es obligatorio"),
  description: z.string().min(1, "La descripción es obligatoria"),
  rules: z.string().min(1, "Las reglas del servicio son obligatorias"),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

interface ServiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (service: Service) => void; // onSubmit expects the full Service object including an ID (can be empty for new)
  service?: Service | null;
  isLoading?: boolean;
}

export default function ServiceForm({ isOpen, onClose, onSubmit, service, isLoading }: ServiceFormProps) {
  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      description: '',
      rules: '',
    },
  });

  useEffect(() => {
    if (isOpen) { // Reset form when dialog opens
      if (service) {
        form.reset({
          name: service.name,
          description: service.description,
          rules: service.rules,
        });
      } else {
        form.reset({
          name: '',
          description: '',
          rules: '',
        });
      }
    }
  }, [service, form, isOpen]);

  const handleSubmit = (data: ServiceFormData) => {
    onSubmit({
      id: service?.id || '', // Pass existing id or empty string for new
      ...data,
    });
    // onClose(); // Let parent handle closing on success
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) onClose(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{service ? 'Editar Servicio' : 'Añadir Nuevo Servicio'}</DialogTitle>
          <DialogDescription>
            {service ? 'Actualice los detalles del servicio.' : 'Complete los detalles para el nuevo servicio.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Servicio</FormLabel>
                  <FormControl>
                    <Input placeholder="ej., Sala de Emergencias" {...field} disabled={isLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describa brevemente el servicio" {...field} disabled={isLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rules"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reglas y Requisitos</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Ingrese reglas específicas del servicio, necesidades de personal, etc." {...field} rows={4} disabled={isLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {service ? 'Guardar Cambios' : 'Crear Servicio'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
