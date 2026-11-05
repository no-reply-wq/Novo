'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  trend?: number; // positive = up, negative = down, 0 = flat
  trendLabel?: string;
  sparkline?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  trend,
  trendLabel,
  sparkline,
  icon,
  className,
}: StatCardProps) {
  const isUp = trend !== undefined && trend > 0;
  const isDown = trend !== undefined && trend < 0;
  const isFlat = trend !== undefined && trend === 0;

  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-sm)]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <span className="text-xs font-medium text-[var(--color-fg-muted)] uppercase tracking-wide">
          {label}
        </span>
        {icon && (
          <span className="text-[var(--color-fg-muted)] opacity-60" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-2xl font-bold text-[var(--color-fg-base)] font-mono tabular-nums">
            {value}
          </div>
          {trend !== undefined && (
            <div
              className={cn(
                'inline-flex items-center gap-1 mt-1.5 text-xs font-medium',
                isUp && 'text-[var(--color-success)]',
                isDown && 'text-[var(--color-danger)]',
                isFlat && 'text-[var(--color-fg-muted)]'
              )}
              aria-label={`Trend: ${isUp ? 'up' : isDown ? 'down' : 'flat'} ${Math.abs(trend)}%`}
            >
              {isUp && <TrendingUp size={12} aria-hidden="true" />}
              {isDown && <TrendingDown size={12} aria-hidden="true" />}
              {isFlat && <Minus size={12} aria-hidden="true" />}
              <span>
                {trend > 0 ? '+' : ''}{trend}%
                {trendLabel && <span className="text-[var(--color-fg-muted)] font-normal ml-1">{trendLabel}</span>}
              </span>
            </div>
          )}
        </div>

        {sparkline && (
          <div className="w-20 h-10 opacity-60" aria-hidden="true">
            {sparkline}
          </div>
        )}
      </div>
    </div>
  );
}
