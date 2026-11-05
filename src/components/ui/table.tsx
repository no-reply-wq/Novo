'use client';

import * as React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from './checkbox';
import { Spinner } from './spinner';
import { EmptyState } from './empty-state';

export interface ColumnDef<T = Record<string, unknown>> {
  key: string;
  header: React.ReactNode;
  width?: number;
  minWidth?: number;
  sortable?: boolean;
  render?: (value: unknown, row: T, index: number) => React.ReactNode;
}

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  key: string;
  direction: SortDirection;
}

export interface TableProps<T extends Record<string, unknown> = Record<string, unknown>> {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey?: keyof T | ((row: T) => string);
  loading?: boolean;
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  stickyHeader?: boolean;
  className?: string;
  maxHeight?: number;
  /** Enable virtualized rendering for large datasets */
  virtualize?: boolean;
  rowHeight?: number;
}

const DEFAULT_ROW_HEIGHT = 44;
const OVERSCAN = 5;

function getRowKey<T extends Record<string, unknown>>(
  row: T,
  rowKey: TableProps<T>['rowKey'],
  index: number
): string {
  if (!rowKey) return String(index);
  if (typeof rowKey === 'function') return rowKey(row);
  return String(row[rowKey]);
}

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  loading = false,
  sort,
  onSortChange,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  onRowClick,
  emptyState,
  stickyHeader = true,
  className,
  maxHeight = 600,
  virtualize = false,
  rowHeight = DEFAULT_ROW_HEIGHT,
}: TableProps<T>) {
  const [colWidths, setColWidths] = React.useState<Record<string, number>>({});
  const [lastSelectedIndex, setLastSelectedIndex] = React.useState<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);

  const shouldVirtualize = virtualize && data.length >= 500;

  // Virtualization
  const containerHeight = maxHeight;
  const totalHeight = data.length * rowHeight;
  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const visibleEnd = Math.min(
    data.length,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + OVERSCAN
  );
  const visibleData = shouldVirtualize ? data.slice(visibleStart, visibleEnd) : data;
  const topSpacer = shouldVirtualize ? visibleStart * rowHeight : 0;
  const bottomSpacer = shouldVirtualize ? (data.length - visibleEnd) * rowHeight : 0;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (shouldVirtualize) setScrollTop((e.target as HTMLDivElement).scrollTop);
  };

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    if (sort?.key === key) {
      onSortChange({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      onSortChange({ key, direction: 'asc' });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange(new Set(data.map((row, i) => getRowKey(row, rowKey, i))));
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleSelectRow = (key: string, index: number, e: React.MouseEvent) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (e.shiftKey && lastSelectedIndex !== null) {
      const lo = Math.min(lastSelectedIndex, index);
      const hi = Math.max(lastSelectedIndex, index);
      for (let i = lo; i <= hi; i++) {
        next.add(getRowKey(data[i], rowKey, i));
      }
    } else {
      if (next.has(key)) next.delete(key);
      else next.add(key);
    }
    setLastSelectedIndex(index);
    onSelectionChange(next);
  };

  // Column resize
  const startResize = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[colKey] ?? 150;
    const onMove = (me: MouseEvent) => {
      setColWidths((prev) => ({ ...prev, [colKey]: Math.max(60, startW + me.clientX - startX) }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const allSelected = data.length > 0 && selectedKeys.size === data.length;
  const someSelected = selectedKeys.size > 0 && selectedKeys.size < data.length;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={cn(
        'relative overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)]',
        className
      )}
      style={{ maxHeight, contain: shouldVirtualize ? 'strict' : undefined }}
    >
      <table className="w-full border-collapse text-sm">
        <thead
          className={cn(
            'bg-[var(--color-bg-muted)] text-left',
            stickyHeader && 'sticky top-0 z-10'
          )}
        >
          <tr>
            {selectable && (
              <th className="w-10 pl-4 pr-2 py-3 border-b border-[var(--color-border)]">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={handleSelectAll}
                  aria-label="Select all rows"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  width: colWidths[col.key] ?? col.width,
                  minWidth: col.minWidth ?? 80,
                }}
                className="relative px-4 py-3 font-medium text-xs text-[var(--color-fg-muted)] uppercase tracking-wide border-b border-[var(--color-border)] whitespace-nowrap"
              >
                <div className="flex items-center gap-2">
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1.5 hover:text-[var(--color-fg-base)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded"
                    >
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.direction === 'asc' ? (
                          <ChevronUp size={12} className="text-[var(--color-primary)]" />
                        ) : (
                          <ChevronDown size={12} className="text-[var(--color-primary)]" />
                        )
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </div>
                {/* Resize handle */}
                <div
                  onMouseDown={(e) => startResize(col.key, e)}
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[var(--color-primary)] opacity-0 hover:opacity-100 transition-opacity"
                  aria-hidden="true"
                />
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="bg-[var(--color-bg-base)] divide-y divide-[var(--color-border)]">
          {loading && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="py-16 text-center">
                <div className="flex items-center justify-center gap-2 text-[var(--color-fg-muted)]">
                  <Spinner size="sm" />
                  <span className="text-sm">Loading…</span>
                </div>
              </td>
            </tr>
          )}

          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)}>
                {emptyState ?? (
                  <EmptyState title="No data" description="No rows to display." />
                )}
              </td>
            </tr>
          )}

          {!loading && shouldVirtualize && topSpacer > 0 && (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)} style={{ height: topSpacer, padding: 0 }} /></tr>
          )}

          {!loading && visibleData.map((row, relativeIndex) => {
            const index = shouldVirtualize ? visibleStart + relativeIndex : relativeIndex;
            const key = getRowKey(row, rowKey, index);
            const isSelected = selectedKeys.has(key);
            return (
              <tr
                key={key}
                onClick={(e) => {
                  if (selectable) handleSelectRow(key, index, e);
                  onRowClick?.(row);
                }}
                className={cn(
                  'transition-colors',
                  (onRowClick || selectable) && 'cursor-pointer',
                  isSelected
                    ? 'bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)]'
                    : 'hover:bg-[var(--color-bg-muted)]'
                )}
                style={shouldVirtualize ? { height: rowHeight } : undefined}
              >
                {selectable && (
                  <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleSelectRow(key, index, { shiftKey: false } as React.MouseEvent)}
                      aria-label={`Select row ${index + 1}`}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-3 text-[var(--color-fg-base)] max-w-0"
                  >
                    <div className="truncate">
                      {col.render
                        ? col.render(row[col.key], row, index)
                        : (row[col.key] as React.ReactNode) ?? '—'}
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}

          {!loading && shouldVirtualize && bottomSpacer > 0 && (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)} style={{ height: bottomSpacer, padding: 0 }} /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
