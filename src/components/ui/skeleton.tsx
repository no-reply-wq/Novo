'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SkeletonProps {
  className?: string;
  children?: React.ReactNode;
  /** Width in px or CSS value */
  width?: string | number;
  /** Height in px or CSS value */
  height?: string | number;
  rounded?: boolean;
}

export function Skeleton({ className, children, width, height, rounded = false }: SkeletonProps) {
  if (children) {
    return (
      <div
        className={cn('relative overflow-hidden', className)}
        aria-hidden="true"
      >
        <div className="invisible">{children}</div>
        <div className="absolute inset-0 rounded-[var(--radius-sm)] bg-[var(--color-bg-muted)] animate-pulse" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-[var(--color-bg-muted)] animate-pulse',
        rounded ? 'rounded-full' : 'rounded-[var(--radius-sm)]',
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={16}
          className={i === lines - 1 ? 'w-3/4' : 'w-full'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 space-y-4',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <Skeleton width={40} height={40} rounded />
        <div className="flex-1 space-y-2">
          <Skeleton height={14} className="w-1/3" />
          <Skeleton height={12} className="w-1/2" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}
