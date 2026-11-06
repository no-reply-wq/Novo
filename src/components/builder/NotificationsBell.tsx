'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  title?: string;
  body?: string;
  message?: string;
  read: boolean;
  read_at?: string | null;
  link?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  created_at: string;
}

interface Props {
  tenantSlug: string;
  pollIntervalMs?: number;
}

export function NotificationsBell({ tenantSlug, pollIntervalMs = 30000 }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      const res = await fetch(
        `/api/tenant/notifications?tenant=${encodeURIComponent(tenantSlug)}&limit=50`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Notification[];
        unreadCount: number;
      };
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silently fail — bell is non-critical
    }
  }, [tenantSlug]);

  useEffect(() => {
    void fetchNotifications();
    const timer = setInterval(fetchNotifications, pollIntervalMs);
    return () => clearInterval(timer);
  }, [fetchNotifications, pollIntervalMs]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function markAllRead() {
    setLoading(true);
    try {
      await fetch(
        `/api/tenant/notifications?tenant=${encodeURIComponent(tenantSlug)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark_all_read' }),
        }
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    try {
      await fetch(
        `/api/tenant/notifications?tenant=${encodeURIComponent(tenantSlug)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark_read', id }),
        }
      );
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // non-critical
    }
  }

  function formatTime(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function getText(n: Notification): string {
    return n.body ?? n.message ?? n.title ?? '';
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void fetchNotifications();
        }}
        className="relative p-1.5 rounded-md text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)] transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-[10px] font-bold flex items-center justify-center"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-[var(--color-bg-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold text-[var(--color-fg-base)]">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-xs text-[var(--color-primary)] hover:opacity-80 font-medium disabled:opacity-40 transition-opacity"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-[var(--color-border)]">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--color-fg-muted)]">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => {
                const text = getText(n);
                const isLink = !!n.link;
                const Wrapper = isLink ? 'a' : 'div';
                return (
                  <Wrapper
                    key={n.id}
                    {...(isLink ? { href: n.link ?? '#' } : {})}
                    className={cn(
                      'block px-4 py-3 text-sm transition-colors',
                      !n.read
                        ? 'bg-[var(--color-primary)]/5 hover:bg-[var(--color-primary)]/10'
                        : 'hover:bg-[var(--color-bg-muted)]',
                      isLink && 'cursor-pointer'
                    )}
                    onClick={() => {
                      if (!n.read) void markRead(n.id);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && (
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                      )}
                      <div className={cn('flex-1 min-w-0', n.read && 'pl-3.5')}>
                        {n.title && n.title !== text && (
                          <p className="font-medium text-[var(--color-fg-base)] truncate">
                            {n.title}
                          </p>
                        )}
                        <p className="text-[var(--color-fg-muted)] leading-relaxed line-clamp-2">
                          {text}
                        </p>
                        <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
                          {formatTime(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </Wrapper>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
