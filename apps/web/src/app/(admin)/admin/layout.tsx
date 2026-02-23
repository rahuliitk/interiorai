'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { cn } from '@openlintel/ui';
import {
  LayoutDashboard,
  Users,
  Server,
  ListTodo,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';

const adminNavigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'System', href: '/admin/system', icon: Server },
  { name: 'Jobs', href: '/admin/jobs', icon: ListTodo },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  // Admin guard: redirect non-admins
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session?.user) {
    router.push('/auth/signin');
    return null;
  }

  // Check admin role — stored on session via JWT callback
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== 'admin') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            You do not have administrator privileges.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Admin Sidebar */}
      <aside className="flex h-full w-60 flex-col border-r bg-gray-50/50">
        <div className="p-4">
          <Link href="/admin" className="flex items-center gap-2 text-lg font-bold text-primary">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white text-sm font-bold">
              OL
            </div>
            <span>Admin Panel</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </p>
          {adminNavigation.map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href);
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
        </nav>

        <div className="border-t p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to App
          </Link>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b bg-white px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-red-600" />
            <h2 className="text-sm font-medium text-muted-foreground">
              OpenLintel Administration
            </h2>
          </div>
          <div className="text-sm text-muted-foreground">
            {session.user.name} ({session.user.email})
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
