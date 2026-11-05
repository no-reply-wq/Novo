'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-16 px-6 text-center',
        className
      )}
    >
      {icon && (
        <div className="text-[var(--color-fg-muted)] opacity-50 mb-1" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--color-fg-base)]">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--color-fg-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
