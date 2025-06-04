
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
  UsersCog, // Nueva Icono
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  tooltip: string;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Panel', icon: LayoutDashboard, tooltip: 'Panel' },
  { href: '/services', label: 'Servicios', icon: BriefcaseMedical, tooltip: 'Administrar Servicios' },
  { href: '/employees', label: 'Empleados', icon: UsersRound, tooltip: 'Administrar Empleados' },
  { href: '/schedule', label: 'Horario', icon: CalendarDays, tooltip: 'Ver y Generar Horario' },
  { href: '/reports', label: 'Informes', icon: LineChart, tooltip: 'Ver Informes' },
  { href: '/service-overview', label: 'Personal por Servicio', icon: UsersCog, tooltip: 'Ver Personal por Servicio' }, // Nuevo Enlace
];

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

