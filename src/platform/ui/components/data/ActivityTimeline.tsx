'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface ActivityItem {
  id?: string;
  icon?: React.ReactNode;
  text: string;
  user?: string;
  timestamp: Date | string;
}

export interface ActivityTimelineProps {
  items: ActivityItem[];
  className?: string;
}

function timeAgo(d: Date | string) {
  const ms = Date.now() - new Date(d).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

export function ActivityTimeline({ items, className }: ActivityTimelineProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {items.map((item, i) => (
        <div key={item.id ?? i} className="flex gap-3 pb-4 last:pb-0">
          {/* Icon / dot */}
          <div className="flex flex-col items-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--muted)]">
              {item.icon ?? '•'}
            </div>
            {i < items.length - 1 && <div className="mt-1 flex-1 w-px bg-[var(--border)]" />}
          </div>
          {/* Content */}
          <div className="flex-1 pt-0.5 pb-4">
            <p className="text-xs text-[var(--fg)]">{item.text}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--muted)]">
              {item.user && <span className="font-medium">{item.user}</span>}
              <span>{timeAgo(item.timestamp)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
