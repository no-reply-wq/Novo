'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Bell, LogOut, User, Grid, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Breadcrumb, type BreadcrumbItem } from '@/components/ui/breadcrumb';

interface TopBarProps {
  appName?: string;
  tenantName: string;
  userName: string;
  userEmail: string;
  notificationCount?: number;
  currentLocation?: string;
  locations?: string[];
  onLocationChange?: (location: string) => void;
  className?: string;
}

function useBreadcrumbs(appName: string | undefined): BreadcrumbItem[] {
  const pathname = usePathname();
  const segments = pathname.replace(/^\/builder\/?/, '').split('/').filter(Boolean);

  const items: BreadcrumbItem[] = [
    { key: 'builder', label: 'Builder', href: '/builder' },
  ];

  if (appName && segments[0] === 'apps') {
    items.push({ key: 'app', label: appName, href: `/builder/apps/${segments[1]}` });
    const rest = segments.slice(2);
    rest.forEach((seg, i) => {
      const href = `/builder/apps/${segments[1]}/${rest.slice(0, i + 1).join('/')}`;
      items.push({
        key: `seg-${i}`,
        label: seg.charAt(0).toUpperCase() + seg.slice(1),
        href,
      });
    });
  } else {
    segments.forEach((seg, i) => {
      const href = `/builder/${segments.slice(0, i + 1).join('/')}`;
      items.push({
        key: `seg-${i}`,
        label: seg.charAt(0).toUpperCase() + seg.slice(1),
        href,
      });
    });
  }

  return items;
}

export function TopBar({
  appName,
  tenantName,
  userName,
  notificationCount = 0,
  currentLocation,
  locations = [],
  onLocationChange,
  className,
}: Omit<TopBarProps, 'userEmail'> & { userEmail?: string }) {
  const router = useRouter();
  const breadcrumbs = useBreadcrumbs(appName);

  const userMenuItems = [
    {
      key: 'profile',
      label: 'Profile',
      icon: <User className="w-4 h-4" />,
      onClick: () => router.push('/profile'),
    },
    {
      key: 'switch-app',
      label: 'Switch App',
      icon: <Grid className="w-4 h-4" />,
      onClick: () => router.push('/builder'),
    },
    { type: 'separator' as const, key: 'sep1' },
    {
      key: 'logout',
      label: 'Log out',
      icon: <LogOut className="w-4 h-4" />,
      danger: true,
      onClick: () => signOut({ callbackUrl: '/login' }),
    },
  ];

  return (
    <header
      className={cn(
        'flex items-center gap-4 h-14 px-4 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] shrink-0',
        className
      )}
    >
      {/* Left: logo + app name */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <div
          className="w-7 h-7 rounded-lg bg-[var(--color-primary)] flex items-center justify-center text-[var(--color-primary-fg)] font-bold text-sm shrink-0"
          aria-hidden="true"
        >
          {tenantName.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-semibold text-[var(--color-fg-base)] truncate max-w-32">
          {tenantName}
        </span>
        {appName && (
          <>
            <ChevronRight className="w-3 h-3 text-[var(--color-fg-muted)] shrink-0" />
            <span className="text-sm text-[var(--color-fg-muted)] truncate max-w-32">{appName}</span>
          </>
        )}
      </div>

      {/* Center: breadcrumb */}
      <div className="flex-1 min-w-0">
        <Breadcrumb items={breadcrumbs} maxItems={4} />
      </div>

      {/* Right: location switcher, notifications, user */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Location switcher */}
        {locations.length > 0 && (
          <DropdownMenu
            trigger={
              <button
                className="text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] px-2 py-1 rounded-md hover:bg-[var(--color-bg-muted)] transition-colors"
                aria-label="Switch location"
              >
                {currentLocation ?? locations[0]}
              </button>
            }
            items={locations.map((loc) => ({
              key: loc,
              label: loc,
              onClick: () => onLocationChange?.(loc),
            }))}
            align="end"
          />
        )}

        {/* Notifications */}
        <button
          className="relative p-1.5 rounded-md text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)] transition-colors"
          aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ''}`}
        >
          <Bell className="w-4 h-4" />
          {notificationCount > 0 && (
            <span
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-[10px] font-bold flex items-center justify-center"
              aria-hidden="true"
            >
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        {/* User avatar + dropdown */}
        <DropdownMenu
          trigger={
            <button
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              aria-label={`User menu for ${userName}`}
            >
              <Avatar name={userName} size="sm" />
            </button>
          }
          items={userMenuItems}
          align="end"
        />
      </div>
    </header>
  );
}
