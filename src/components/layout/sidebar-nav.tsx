
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  BriefcaseMedical,
  UsersRound,
  CalendarDays,
  LineChart,
  UserCog,
  CalendarHeart,
  type LucideIcon,
} from 'lucide-react';

/**
 * Define la estructura de un ítem de navegación en la barra lateral.
 */
interface NavItem {
  /** La ruta a la que enlaza el ítem. */
  href: string;
  /** La etiqueta textual que se muestra para el ítem. */
  label: string;
  /** El componente de icono Lucide que se muestra junto a la etiqueta. */
  icon: LucideIcon;
  /** Texto que se muestra como tooltip cuando la barra lateral está colapsada. */
  tooltip: string;
}

/**
 * Array que define todos los ítems de navegación para la barra lateral.
 * Cada objeto `NavItem` especifica la ruta, etiqueta, icono y tooltip.
 */
const navItems: NavItem[] = [
  { href: '/', label: 'Panel', icon: LayoutDashboard, tooltip: 'Panel' },
  { href: '/services', label: 'Servicios', icon: BriefcaseMedical, tooltip: 'Administrar Servicios' },
  { href: '/employees', label: 'Empleados', icon: UsersRound, tooltip: 'Administrar Empleados' },
  { href: '/schedule', label: 'Horario', icon: CalendarDays, tooltip: 'Ver y Generar Horario' },
  { href: '/reports', label: 'Informes', icon: LineChart, tooltip: 'Ver Informes' },
  { href: '/service-overview', label: 'Personal por Servicio', icon: UserCog, tooltip: 'Ver Personal por Servicio' },
  { href: '/holidays', label: 'Feriados', icon: CalendarHeart, tooltip: 'Administrar Feriados' },
];

/**
 * `SidebarNav` es el componente responsable de renderizar la lista de
 * elementos de navegación dentro de la barra lateral (`Sidebar`).
 *
 * Utiliza el hook `usePathname` de Next.js para determinar la ruta activa
 * y aplicar estilos correspondientes al `SidebarMenuButton` activo.
 * Cada ítem de navegación es un enlace (`Link`) que utiliza los componentes
 * `SidebarMenuItem` y `SidebarMenuButton` de `src/components/ui/sidebar`
 * para una apariencia y comportamiento consistentes.
 *
 * @returns {JSX.Element} El elemento JSX que representa el menú de navegación de la barra lateral.
 */
export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.href}>
          <Link href={item.href} passHref legacyBehavior>
            <SidebarMenuButton
              asChild
              isActive={pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))}
              tooltip={item.tooltip}
              className="w-full"
            >
              <a> {/* Link component needs an 'a' tag as child when asChild is used with legacyBehavior */}
                <item.icon className="h-5 w-5" />
                <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
              </a>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
