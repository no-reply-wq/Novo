'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  User,
  X,
} from 'lucide-react';
import type { AppConfig } from '@/types/runtime';
import { cn } from '@/lib/utils';
import { ToastProvider } from '@/components/ui/toast';
import { OfflineBanner } from '@/pwa/OfflineBanner';

export interface AppShellProps {
  app: AppConfig;
  tenantSlug: string;
  currentPageSlug: string;
  userName: string | null;
  userEmail: string;
  children: React.ReactNode;
}

export function AppShell({
  app,
  tenantSlug,
  currentPageSlug,
  userName,
  userEmail,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const initials = getInitials(userName ?? userEmail);

  const navItems = app.navItems;

  // Inject theme CSS on mount
  useEffect(() => {
    if (!app.id || !tenantSlug) return;
    const styleId = `app-theme-${app.id}`;
    if (document.getElementById(styleId)) return;

    fetch(`/api/runtime/theme/${app.id}?tenant=${tenantSlug}`)
      .then((res) => res.text())
      .then((css) => {
        const existing = document.getElementById(styleId);
        if (existing) return;
        const styleEl = document.createElement('style');
        styleEl.id = styleId;
        // css-generator returns a full <style> block; extract inner content
        const inner = css.replace(/<\/?style[^>]*>/g, '').replace(/@import url\([^)]+\);?\s*/g, (match) => {
          // Extract and inject Google Fonts link separately
          const urlMatch = /url\('([^']+)'\)/.exec(match);
          if (urlMatch) {
            const linkId = `app-font-${app.id}`;
            if (!document.getElementById(linkId)) {
              const link = document.createElement('link');
              link.id = linkId;
              link.rel = 'stylesheet';
              link.href = urlMatch[1];
              document.head.appendChild(link);
            }
          }
          return '';
        });
        styleEl.textContent = inner;
        document.head.appendChild(styleEl);
      })
      .catch(() => {/* theme is cosmetic — ignore errors */});
  }, [app.id, tenantSlug]);

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-gray-200 bg-white transition-transform lg:static lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* App header */}
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            {app.icon && (
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-white"
                style={{ backgroundColor: app.color ?? '#6366f1' }}
              >
                {app.icon}
              </span>
            )}
            <span className="truncate text-sm font-semibold text-gray-900">{app.name}</span>
            <button
              className="ml-auto lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X size={16} />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            {navItems.map((item) => {
              const href = `/${tenantSlug}/${app.slug}/p/${item.pageSlug}`;
              const isActive = currentPageSlug === item.pageSlug || pathname === href;
              return (
                <Link
                  key={item.id}
                  href={href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-indigo-50 font-medium text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  {item.icon && (
                    <span className="text-base" aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main column */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Top bar */}
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
            {/* Hamburger (mobile) */}
            <button
              className="rounded p-1 text-gray-500 hover:bg-gray-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={18} />
            </button>

            {/* Breadcrumb placeholder / page title */}
            <span className="text-sm font-medium text-gray-700 capitalize">
              {currentPageSlug.replace(/-/g, ' ')}
            </span>

            <div className="ml-auto flex items-center gap-2">
              {/* Notifications */}
              <button
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Notifications"
              >
                <Bell size={16} />
              </button>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((o: boolean) => !o)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
                  aria-haspopup="true"
                  aria-expanded={userMenuOpen}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                    {initials}
                  </span>
                  <span className="hidden sm:block max-w-24 truncate">{userName ?? userEmail}</span>
                  <ChevronDown size={12} />
                </button>

                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setUserMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                      <div className="border-b border-gray-100 px-3 py-2">
                        <p className="text-xs font-medium text-gray-900 truncate">
                          {userName ?? userEmail}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                      </div>
                      <Link
                        href="/login"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <User size={14} />
                        Profile
                      </Link>
                      <form action="/api/auth/signout" method="POST">
                        <button
                          type="submit"
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <LogOut size={14} />
                          Sign out
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      <OfflineBanner />
    </ToastProvider>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
