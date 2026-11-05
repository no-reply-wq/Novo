'use client';

import * as React from 'react';
import { Check, Clock, AlertCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TimelineStatus = 'done' | 'active' | 'pending' | 'error';

export interface TimelineStep {
  key: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: TimelineStatus;
  timestamp?: string;
  icon?: React.ReactNode;
}

export interface TimelineProps {
  steps: TimelineStep[];
  className?: string;
}

const statusConfig: Record<TimelineStatus, { icon: React.ReactNode; iconClass: string; dotClass: string }> = {
  done: {
    icon: <Check size={12} />,
    iconClass: 'text-white',
    dotClass: 'bg-[var(--color-success)] border-[var(--color-success)]',
  },
  active: {
    icon: <Clock size={12} />,
    iconClass: 'text-white',
    dotClass: 'bg-[var(--color-primary)] border-[var(--color-primary)]',
  },
  error: {
    icon: <AlertCircle size={12} />,
    iconClass: 'text-white',
    dotClass: 'bg-[var(--color-danger)] border-[var(--color-danger)]',
  },
  pending: {
    icon: <Circle size={8} />,
    iconClass: 'text-[var(--color-fg-muted)]',
    dotClass: 'bg-[var(--color-bg-base)] border-[var(--color-border)]',
  },
};

export function Timeline({ steps, className }: TimelineProps) {
  return (
    <ol
      aria-label="Timeline"
      className={cn('relative space-y-0', className)}
    >
      {steps.map((step, i) => {
        const status = step.status ?? 'pending';
        const config = statusConfig[status];
        const isLast = i === steps.length - 1;

        return (
          <li key={step.key} className="relative flex gap-4 pb-6">
            {/* Connector line */}
            {!isLast && (
              <div
                className="absolute left-[14px] top-7 bottom-0 w-px bg-[var(--color-border)]"
                aria-hidden="true"
              />
            )}

            {/* Dot */}
            <div
              className={cn(
                'flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center z-10',
                config.dotClass
              )}
              aria-hidden="true"
            >
              {step.icon ? (
                <span className={config.iconClass}>{step.icon}</span>
              ) : (
                <span className={config.iconClass}>{config.icon}</span>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    'text-sm font-medium',
                    status === 'active'
                      ? 'text-[var(--color-fg-base)]'
                      : status === 'pending'
                        ? 'text-[var(--color-fg-muted)]'
                        : 'text-[var(--color-fg-base)]'
                  )}
                >
                  {step.title}
                </span>
                {step.timestamp && (
                  <time className="text-xs text-[var(--color-fg-muted)] whitespace-nowrap flex-shrink-0">
                    {step.timestamp}
                  </time>
                )}
              </div>
              {step.description && (
                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{step.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
