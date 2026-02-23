'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Settings,
  Palette,
  FileText,
  ShoppingCart,
  Scissors,
  Zap,
  CalendarDays,
  CreditCard,
  Users,
  MessageSquare,
  Box,
  BarChart3,
  Map,
  Store,
  ClipboardList,
  Bell,
} from 'lucide-react';
import { cn } from '@openlintel/ui';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/dashboard', icon: FolderKanban },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Marketplace', href: '/marketplace', icon: Store },
  { name: 'Notifications', href: '/notifications', icon: Bell },
];

const projectNavigation = [
  { name: 'Rooms', href: 'rooms', icon: LayoutDashboard },
  { name: 'Designs', href: 'designs', icon: Palette },
  { name: 'Floor Plan', href: 'floor-plan', icon: Map },
  { name: '3D Editor', href: 'editor', icon: Box },
  { name: 'Drawings', href: 'drawings', icon: FileText },
  { name: 'BOM', href: 'bom', icon: ShoppingCart },
  { name: 'Cut List', href: 'cutlist', icon: Scissors },
  { name: 'MEP', href: 'mep', icon: Zap },
  { name: 'Timeline', href: 'timeline', icon: CalendarDays },
  { name: 'Site Logs', href: 'site-logs', icon: ClipboardList },
  { name: 'Payments', href: 'payments', icon: CreditCard },
  { name: 'Analytics', href: 'analytics', icon: BarChart3 },
];

export function Sidebar({ projectId }: { projectId?: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-gray-50/50">
      <div className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold text-primary">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white text-sm font-bold">
            OL
          </div>
          OpenLintel
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
        <div className="mb-4">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Main
          </p>
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-gray-100 hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </div>

        {projectId && (
          <div>
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Project
            </p>
            {projectNavigation.map((item) => {
              const href = `/project/${projectId}/${item.href}`;
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={item.name}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-gray-100 hover:text-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className="border-t p-3">
        <Link
          href="/dashboard/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground',
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
