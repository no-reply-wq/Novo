'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  label?: string;
  className?: string;
}

export function Divider({ orientation = 'horizontal', label, className }: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn('w-px self-stretch bg-[var(--color-border)]', className)}
      />
    );
  }

  if (label) {
    return (
      <div role="separator" className={cn('flex items-center gap-3', className)}>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
        <span className="text-xs text-[var(--color-fg-muted)] font-medium uppercase tracking-wide">
          {label}
        </span>
        <div className="flex-1 h-px bg-[var(--color-border)]" />
      </div>
    );
  }

  return (
    <hr
      role="separator"
      className={cn('border-0 h-px bg-[var(--color-border)]', className)}
    />
  );
}
