'use client';
import React from 'react';
import { cn } from '@/lib/utils';
export type Row = Record<string, unknown>;
export interface CardGridProps {
  items: Row[];
  cardTemplate: (item: Row) => React.ReactNode;
  columns?: 2 | 3 | 4;
  loading?: boolean;
  onCardClick?: (item: Row) => void;
}
function SkeletonCard() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
      <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--surface-2)]" />
    </div>
  );
}
export function CardGrid({ items, cardTemplate, columns = 3, loading = false, onCardClick }: CardGridProps) {
  const colClasses = { 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' };
  if (loading) {
    return (
      <div className={cn('grid gap-4', colClasses[columns])}>
        {Array.from({ length: columns * 2 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }
  return (
    <div className={cn('grid gap-4', colClasses[columns])}>
      {items.map((item, i) => (
        <div key={i} onClick={() => onCardClick?.(item)} className={cn(onCardClick && 'cursor-pointer')}>
          {cardTemplate(item)}
        </div>
      ))}
    </div>
  );
}
