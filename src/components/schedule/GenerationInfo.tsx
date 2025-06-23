import type { Service, Employee } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Briefcase, Bed, Sun, Sunset } from 'lucide-react';

interface GenerationInfoProps {
  service: Service;
  employees: Employee[];
}

export default function GenerationInfo({ service, employees }: GenerationInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Información de Generación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold flex items-center"><Briefcase className="mr-2 h-5 w-5" />Servicio</h3>
          <p>{service.nombre_servicio}</p>
        </div>
        <div>
          <h3 className="font-semibold flex items-center"><Users className="mr-2 h-5 w-5" />Dotación Necesaria (Día de Semana)</h3>
          <div className="flex space-x-4">
            <span className="flex items-center"><Sun className="inline mr-1 h-4 w-4" />Mañana: <Badge className="ml-2">{service.dotacion_objetivo_lunes_a_viernes_mananas}</Badge></span>
            <span className="flex items-center"><Sunset className="inline mr-1 h-4 w-4" />Tarde: <Badge className="ml-2">{service.dotacion_objetivo_lunes_a_viernes_tardes}</Badge></span>
            {service.habilitar_turno_noche && <span className="flex items-center"><Bed className="inline mr-1 h-4 w-4" />Noche: <Badge className="ml-2">{service.dotacion_objetivo_lunes_a_viernes_noche}</Badge></span>}
          </div>
        </div>
        <div>
          <h3 className="font-semibold flex items-center"><Users className="mr-2 h-5 w-5" />Empleados Asignados ({employees.length})</h3>
          <ul className="list-disc pl-5">
            {employees.map(e => <li key={e.id_empleado}>{e.nombre}</li>)}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
