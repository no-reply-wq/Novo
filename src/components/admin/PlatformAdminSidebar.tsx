'use client';

/**
 * Client component (lucide-react icons use React context, which can't be
 * evaluated in a Server Component). The server-only auth check stays in the
 * layout; this renders the admin navigation + account controls.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Building2, Users, Activity, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin/platform', label: 'Overview', icon: Activity },
  { href: '/admin/platform/tenants', label: 'Clients', icon: Building2 },
  { href: '/admin/platform/admins', label: 'Platform staff', icon: Users },
];

export function PlatformAdminSidebar({ userName, userEmail }: { userName: string; userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-surface)] flex flex-col">
      <div className="px-5 h-14 flex items-center border-b border-[var(--color-border)]">
        <span className="text-lg font-semibold tracking-tight text-[var(--color-fg-base)]">
          novo<span className="text-[var(--color-primary)]">.</span>
        </span>
        <span className="ml-2 text-[11px] font-medium text-[var(--color-fg-muted)] bg-[var(--color-bg-muted)] px-1.5 py-0.5 rounded">staff</span>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map((item) => {
          const active = item.href === '/admin/platform'
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors',
                active
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] font-medium'
                  : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)]'
              )}>
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[var(--color-border)]">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-[var(--color-fg-base)] truncate">{userName}</p>
          <p className="text-xs text-[var(--color-fg-muted)] truncate">{userEmail}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login?mode=admin' })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-danger)] hover:bg-[var(--color-bg-muted)] transition-colors mt-1"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
