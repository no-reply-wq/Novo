'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatCardComponentProps {
  value: unknown;
  label: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  prefix?: string;
  suffix?: string;
}

export function StatCardComponent({
  value,
  label,
  trend,
  trendValue,
  prefix = '',
  suffix = '',
}: StatCardComponentProps) {
  const display = formatStatValue(value);

  return (
    <div className="flex h-full flex-col justify-between rounded border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-2xl font-bold text-gray-900 tabular-nums">
          {prefix}{display}{suffix}
        </span>
        {trend && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-sm font-medium',
              trend === 'up' ? 'text-green-600' : 'text-red-500',
            )}
          >
            {trend === 'up' ? (
              <TrendingUp size={14} aria-hidden="true" />
            ) : (
              <TrendingDown size={14} aria-hidden="true" />
            )}
            {trendValue ?? ''}
          </span>
        )}
      </div>
    </div>
  );
}

function formatStatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    // Compact notation for large numbers
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  }
  return String(value);
}
