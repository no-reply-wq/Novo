'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressProps {
  value: number; // 0-100
  max?: number;
  variant?: 'bar' | 'ring';
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'success' | 'warning' | 'danger';
  label?: string;
  showValue?: boolean;
  className?: string;
}

const colorMap = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
} as const;

const barHeightMap = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' } as const;

export function Progress({
  value,
  max = 100,
  variant = 'bar',
  size = 'md',
  color = 'primary',
  label,
  showValue = false,
  className,
}: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const fill = colorMap[color];

  if (variant === 'ring') {
    const ringSize = size === 'sm' ? 48 : size === 'lg' ? 80 : 64;
    const strokeWidth = size === 'sm' ? 4 : size === 'lg' ? 6 : 5;
    const r = (ringSize - strokeWidth * 2) / 2;
    const circumference = 2 * Math.PI * r;
    const offset = circumference - (pct / 100) * circumference;
    const fontSize = size === 'sm' ? 11 : size === 'lg' ? 16 : 13;

    return (
      <div
        className={cn('inline-flex flex-col items-center gap-1.5', className)}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <svg width={ringSize} height={ringSize} className="-rotate-90">
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={r}
            fill="none"
            stroke="var(--color-bg-muted)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={r}
            fill="none"
            stroke={fill}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
        </svg>
        {showValue && (
          <span
            className="absolute text-[var(--color-fg-base)] font-semibold tabular-nums"
            style={{ fontSize }}
          >
            {Math.round(pct)}%
          </span>
        )}
        {label && <span className="text-xs text-[var(--color-fg-muted)]">{label}</span>}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-xs text-[var(--color-fg-muted)]">{label}</span>}
          {showValue && (
            <span className="text-xs font-medium text-[var(--color-fg-muted)] tabular-nums">
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className={cn(
          'w-full rounded-full bg-[var(--color-bg-muted)] overflow-hidden',
          barHeightMap[size]
        )}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
    </div>
  );
}
