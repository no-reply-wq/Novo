'use client';

/**
 * NotificationBell — Agent W2
 * Bell icon in the top nav showing unread count badge.
 * Opens a dropdown with notification list.
 * Uses SSE for real-time updates.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  Workflow,
  AtSign,
  Calendar,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationType } from '@/platform/notifications/types';

function typeIcon(type: NotificationType): React.ReactNode {
  const cls = 'w-4 h-4 shrink-0';
  switch (type) {
    case 'approval_requested': return <CheckCircle2 className={cn(cls, 'text-yellow-500')} />;
    case 'approval_decided':   return <CheckCheck   className={cn(cls, 'text-green-500')} />;
    case 'record_assigned':    return <UserCheck    className={cn(cls, 'text-blue-500')} />;
    case 'workflow_failed':    return <AlertCircle  className={cn(cls, 'text-red-500')} />;
    case 'mention':            return <AtSign       className={cn(cls, 'text-purple-500')} />;
    case 'due_date':           return <Calendar     className={cn(cls, 'text-orange-500')} />;
    default:                   return <Info         className={cn(cls, 'text-[var(--color-fg-muted)]')} />;
  }
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newDot, setNewDot] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=50');
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: AppNotification[] };
      const list = data.notifications ?? [];
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
    } catch {
      // non-critical
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource('/api/notifications/stream');
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      if (!e.data || e.data.startsWith(':')) return;
      try {
        const fresh = JSON.parse(e.data) as AppNotification[];
        if (fresh.length > 0) {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const added = fresh.filter((n) => !existingIds.has(n.id));
            if (added.length === 0) return prev;
            return [...added, ...prev];
          });
          setUnreadCount((c) => c + fresh.length);
          setNewDot(true);
          setTimeout(() => setNewDot(false), 3000);
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
    };
  }, []);

  // Close on outside click
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

  async function handleMarkAllRead() {
    setLoading(true);
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // non-critical
    }
  }

  return (
    <div ref={panelRef} className={cn('relative', className)}>
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
            className={cn(
              'absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-[10px] font-bold flex items-center justify-center',
              newDot && 'animate-bounce',
            )}
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {newDot && unreadCount === 0 && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[var(--color-primary)] animate-ping" />
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
                onClick={handleMarkAllRead}
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
                const isLink = !!n.link;
                const Wrapper = isLink ? 'a' : 'div';
                return (
                  <Wrapper
                    key={n.id}
                    {...(isLink ? { href: n.link } : {})}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 text-sm transition-colors',
                      !n.read
                        ? 'bg-[var(--color-primary)]/5 hover:bg-[var(--color-primary)]/10'
                        : 'hover:bg-[var(--color-bg-muted)]',
                      isLink && 'cursor-pointer',
                    )}
                    onClick={() => {
                      if (!n.read) void handleMarkRead(n.id);
                    }}
                  >
                    <div className="mt-0.5">{typeIcon(n.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-medium text-[var(--color-fg-base)] truncate">
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[var(--color-fg-muted)] leading-relaxed line-clamp-2 mt-0.5">
                        {n.body}
                      </p>
                      <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
                        {timeAgo(new Date(n.createdAt))}
                      </p>
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
