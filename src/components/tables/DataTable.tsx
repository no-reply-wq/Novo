'use client';

import React, { useState } from 'react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Button, Badge, EmptyState, Spinner } from '@/components/ui';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Search } from 'lucide-react';

export interface Column<T = Record<string, unknown>> {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'currency' | 'date' | 'badge' | 'custom';
  sortable?: boolean;
  hiddenForRoles?: string[];
  width?: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  getBadgeColor?: (value: unknown) => string;
}

interface RowAction<T> {
  label: string;
  icon?: React.ReactNode;
  onClick: (row: T) => void;
  variant?: 'default' | 'danger';
  visibleFor?: string[];
  show?: (row: T) => boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (q: string) => void;
  rowActions?: RowAction<T>[];
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  userRole?: string;
  hiddenColumns?: string[];
  showSumRow?: boolean;
  sumColumns?: string[];
  /** Shorthand: {columnKey: true} columns to sum. Enables sumRow automatically. */
  sumRow?: Record<string, boolean>;
  toolbar?: React.ReactNode;
  sortColumn?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (column: string, dir: 'asc' | 'desc') => void;
}

export function DataTable<T>({
  columns,
  data,
  total = 0,
  page = 1,
  pageSize = 50,
  onPageChange,
  loading,
  searchable,
  searchPlaceholder = 'Search…',
  onSearch,
  rowActions = [],
  onRowClick,
  emptyTitle = 'No records found',
  emptyDescription,
  emptyAction,
  userRole,
  hiddenColumns = [],
  showSumRow,
  sumColumns = [],
  toolbar,
  sortColumn,
  sortDir,
  onSort,
}: DataTableProps<T>) {
  const [searchQ, setSearchQ] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const visibleColumns = columns.filter(
    (col) =>
      !hiddenColumns.includes(col.label) &&
      !(userRole && col.hiddenForRoles?.includes(userRole))
  );

  const totalPages = Math.ceil(total / pageSize);

  function handleSearch(q: string) {
    setSearchQ(q);
    onSearch?.(q);
  }

  function handleSort(col: Column<T>) {
    if (!col.sortable || !onSort) return;
    const newDir = sortColumn === col.key && sortDir === 'asc' ? 'desc' : 'asc';
    onSort(col.key, newDir);
  }

  function renderCell(col: Column<T>, row: T) {
    const value = (row as Record<string, unknown>)[col.key as string];

    if (col.render) return col.render(value, row);

    switch (col.type) {
      case 'currency':
        return <span className="tabular-nums">{formatCurrency(value as number)}</span>;
      case 'date':
        return <span className="text-slate-500">{formatDate(value as string)}</span>;
      case 'number':
        return <span className="tabular-nums">{value == null ? '—' : String(value)}</span>;
      case 'badge':
        return value ? (
          <Badge color={col.getBadgeColor?.(value)} variant="default">
            {String(value)}
          </Badge>
        ) : null;
      default:
        return value == null || value === '' ? (
          <span className="text-slate-300">—</span>
        ) : (
          String(value)
        );
    }
  }

  function getSumForColumn(key: string): string {
    const sum = data.reduce((acc, row) => {
      const val = parseFloat(String((row as Record<string, unknown>)[key] ?? 0));
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
    return formatCurrency(sum);
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Toolbar */}
      {(searchable || toolbar) && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border-b border-slate-200">
          {searchable && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
          {toolbar && <div className="flex items-center gap-2 ml-auto">{toolbar}</div>}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap',
                    col.sortable && 'cursor-pointer select-none hover:text-slate-700',
                    col.width
                  )}
                  onClick={() => handleSort(col)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <span className="flex flex-col">
                        <ChevronUp className={cn('w-3 h-3', sortColumn === col.key && sortDir === 'asc' ? 'text-indigo-600' : 'text-slate-300')} />
                        <ChevronDown className={cn('w-3 h-3 -mt-1', sortColumn === col.key && sortDir === 'desc' ? 'text-indigo-600' : 'text-slate-300')} />
                      </span>
                    )}
                  </span>
                </th>
              ))}
              {rowActions.length > 0 && (
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={visibleColumns.length + (rowActions.length > 0 ? 1 : 0)} className="py-20 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-400">
                    <Spinner />
                    <span className="text-sm">Loading…</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (rowActions.length > 0 ? 1 : 0)}>
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr
                  key={((row as Record<string, unknown>).id as string) ?? rowIdx}
                  className={cn(
                    'bg-white hover:bg-slate-50 transition-colors',
                    onRowClick && 'cursor-pointer'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-slate-700 max-w-xs truncate">
                      {renderCell(col, row)}
                    </td>
                  ))}
                  {rowActions.length > 0 && (
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenu(openMenu === String(rowIdx) ? null : String(rowIdx));
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {openMenu === String(rowIdx) && (
                          <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-[140px] py-1">
                            {rowActions.filter(a => !a.show || a.show(row)).map((action, i) => (
                              <button
                                key={i}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenu(null);
                                  action.onClick(row);
                                }}
                                className={cn(
                                  'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50',
                                  action.variant === 'danger' ? 'text-red-600' : 'text-slate-700'
                                )}
                              >
                                {action.icon}
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>

          {/* Sum row */}
          {showSumRow && data.length > 0 && sumColumns.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
                {visibleColumns.map((col, i) => (
                  <td key={col.key} className="px-4 py-3 text-slate-700">
                    {i === 0 ? 'Total' : sumColumns.includes(col.key) ? getSumForColumn(col.key) : ''}
                  </td>
                ))}
                {rowActions.length > 0 && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200">
          <p className="text-xs text-slate-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange?.(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-600 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange?.(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
