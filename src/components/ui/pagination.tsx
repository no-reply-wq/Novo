'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  siblingCount?: number;
  showFirstLast?: boolean;
  className?: string;
}

function getPageRange(page: number, totalPages: number, siblingCount: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const left = Math.max(2, page - siblingCount);
  const right = Math.min(totalPages - 1, page + siblingCount);
  const range: (number | 'ellipsis')[] = [1];

  if (left > 2) range.push('ellipsis');
  for (let i = left; i <= right; i++) range.push(i);
  if (right < totalPages - 1) range.push('ellipsis');
  range.push(totalPages);

  return range;
}

export function Pagination({
  page,
  totalPages,
  onChange,
  siblingCount = 1,
  showFirstLast = true,
  className,
}: PaginationProps) {
  const pages = getPageRange(page, totalPages, siblingCount);

  const btn = (
    label: React.ReactNode,
    targetPage: number,
    disabled: boolean,
    ariaLabel: string,
    isCurrent = false
  ) => (
    <button
      key={`${targetPage}-${ariaLabel}`}
      onClick={() => !disabled && onChange(targetPage)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={isCurrent ? 'page' : undefined}
      className={cn(
        'h-8 min-w-[32px] px-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        isCurrent
          ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
          : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg-base)]'
      )}
    >
      {label}
    </button>
  );

  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-1', className)}>
      {showFirstLast && btn(<ChevronLeft size={14} />, page - 1, page <= 1, 'Previous page')}
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span
            key={`ellipsis-${i}`}
            className="h-8 w-8 flex items-center justify-center text-[var(--color-fg-muted)]"
            aria-hidden="true"
          >
            <MoreHorizontal size={14} />
          </span>
        ) : (
          btn(p, p as number, false, `Page ${p}`, p === page)
        )
      )}
      {showFirstLast && btn(<ChevronRight size={14} />, page + 1, page >= totalPages, 'Next page')}
    </nav>
  );
}

export interface CursorPaginationProps {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  pageInfo?: string;
  className?: string;
}

export function CursorPagination({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  pageInfo,
  className,
}: CursorPaginationProps) {
  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-between gap-4', className)}>
      {pageInfo && (
        <span className="text-sm text-[var(--color-fg-muted)]">{pageInfo}</span>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Previous page"
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-md)] text-sm transition-colors',
            'border border-[var(--color-border)] bg-[var(--color-bg-surface)]',
            'hover:bg-[var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          <ChevronLeft size={14} />
          Previous
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next page"
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-md)] text-sm transition-colors',
            'border border-[var(--color-border)] bg-[var(--color-bg-surface)]',
            'hover:bg-[var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  );
}
