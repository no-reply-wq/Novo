'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ToastProvider } from '@/components/ui/toast';

interface BuilderShellProps {
  children: React.ReactNode;
  tenantName: string;
  userName: string;
  userEmail: string;
}

export function BuilderShell({
  children,
  tenantName,
  userName,
  userEmail,
}: BuilderShellProps) {
  const params = useParams();
  const appId = typeof params?.appId === 'string' ? params.appId : undefined;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appName, setAppName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!appId) { setAppName(undefined); return; }
    fetch(`/api/builder/apps/${appId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.name) setAppName(data.name as string); })
      .catch(() => undefined);
  }, [appId]);

  return (
    <ToastProvider>
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--color-bg-base)]">
      <TopBar
        appName={appName}
        tenantName={tenantName}
        userName={userName}
        userEmail={userEmail}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile hamburger button */}
        <button
          className={cn(
            'fixed bottom-4 left-4 z-50 md:hidden rounded-full w-10 h-10 flex items-center justify-center',
            'bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-lg'
          )}
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Sidebar — always visible on md+, drawer on mobile */}
        <div
          className={cn(
            'fixed md:static inset-y-0 left-0 z-50 md:z-auto transition-transform duration-200',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          )}
        >
          <Sidebar appId={appId} className="h-full" />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}
