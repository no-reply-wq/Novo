'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'default';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  /** Override with a hex color; generates a tinted bg automatically */
  color?: string;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success:
    'bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]',
  warning:
    'bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]',
  danger:
    'bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]',
  info: 'bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] text-[var(--color-info)]',
  neutral: 'bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]',
  /** @deprecated alias for neutral — use neutral or a semantic variant */
  default: 'bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]',
};

export function Badge({ children, variant = 'neutral', color, className }: BadgeProps) {
  if (color) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-full)] text-xs font-medium',
          className
        )}
        style={{ backgroundColor: `${color}1a`, color }}
      >
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-full)] text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
