'use client';
import React from 'react';
import { cn } from '@/lib/utils';
export interface ProgressBarProps { value: number; color?: string; showLabel?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string; }
export function ProgressBar({ value, color = '#6366f1', showLabel = true, size = 'md', className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const heights = { sm: 'h-1', md: 'h-2', lg: 'h-3' };
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]', heights[size])}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${clamped}%`, background: color }}
          role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} />
      </div>
      {showLabel && <span className="w-9 text-right text-xs text-[var(--muted)]">{clamped.toFixed(0)}%</span>}
    </div>
  );
}
