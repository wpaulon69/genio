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
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  tooltip: string;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, tooltip: 'Dashboard' },
  { href: '/services', label: 'Services', icon: BriefcaseMedical, tooltip: 'Manage Services' },
  { href: '/employees', label: 'Employees', icon: UsersRound, tooltip: 'Manage Employees' },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays, tooltip: 'View & Generate Schedule' },
  { href: '/reports', label: 'Reports', icon: LineChart, tooltip: 'View Reports' },
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
