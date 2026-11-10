'use client';

import React, { useState, useMemo } from 'react';
import type { QueryResult, Row } from '@/types/runtime';
import { cn } from '@/lib/utils';

// ─── Date-relative filter operators ─────────────────────────────────────────

export type DateRelativeOperator = 'is_today' | 'is_this_week' | 'is_this_month' | 'is_overdue';

export interface DateFilter {
  column: string;
  operator: DateRelativeOperator;
}

function getDateRange(op: DateRelativeOperator): { from: Date; to: Date } | { before: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (op === 'is_today') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { from: today, to: tomorrow };
  }
  if (op === 'is_this_week') {
    const dayOfWeek = today.getDay(); // 0=Sun
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return { from: weekStart, to: weekEnd };
  }
  if (op === 'is_this_month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return { from: monthStart, to: monthEnd };
  }
  // is_overdue: date < today
  return { before: today };
}

function matchesDateFilter(row: Row, filter: DateFilter): boolean {
  const raw = row[filter.column];
  if (raw === null || raw === undefined || raw === '') return false;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (isNaN(d.getTime())) return false;
  const range = getDateRange(filter.operator);
  if ('before' in range) {
    return d < range.before;
  }
  return d >= range.from && d < range.to;
}

// ─── Convert-to modal ───────────────────────────────────────────────────────

interface ConvertToTarget {
  configId: string;
  name: string;
  targetTableName: string;
}

interface ConvertToModalProps {
  tenantSlug: string;
  tableId: string;
  row: Row;
  onClose: () => void;
}

function ConvertToModal({ tenantSlug, tableId, row, onClose }: ConvertToModalProps) {
  const [targets, setTargets] = useState<ConvertToTarget[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/runtime/${encodeURIComponent(tenantSlug)}/convert-to/targets?tableId=${encodeURIComponent(tableId)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { targets: ConvertToTarget[] };
        setTargets(data.targets);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load targets');
      }
    })();
  }, [tenantSlug, tableId]);

  const handleConvert = async (configId: string) => {
    const recordId = String(row['id'] ?? row['_id'] ?? '');
    if (!recordId) {
      setToast('Cannot determine record ID');
      return;
    }
    setConverting(configId);
    try {
      const res = await fetch(
        `/api/runtime/${encodeURIComponent(tenantSlug)}/stock/convert-to`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configId, sourceRecordIds: [recordId] }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setToast('Converted successfully');
      setTimeout(onClose, 1500);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setConverting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative w-full max-w-sm rounded-xl border border-[var(--color-border,#e2e8f0)] bg-white shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
        style={{ '--color-primary': '#15655b' } as React.CSSProperties}
      >
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Convert to →</h2>

        {toast && (
          <div className={cn(
            'mb-3 rounded px-3 py-2 text-xs',
            toast.includes('success') || toast.includes('Converted')
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700',
          )}>
            {toast}
          </div>
        )}

        {loadError && (
          <div className="mb-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{loadError}</div>
        )}

        {targets === null && !loadError && (
          <div className="text-xs text-gray-400 py-4 text-center">Loading…</div>
        )}

        {targets !== null && targets.length === 0 && (
          <div className="text-xs text-gray-400 py-4 text-center">No conversion targets configured for this table.</div>
        )}

        {targets !== null && targets.length > 0 && (
          <ul className="space-y-2">
            {targets.map((t) => (
              <li key={t.configId}>
                <button
                  type="button"
                  disabled={converting === t.configId}
                  onClick={() => void handleConvert(t.configId)}
                  className="w-full flex items-center justify-between rounded-lg border border-[var(--color-border,#e2e8f0)] px-3 py-2 text-sm hover:border-[#15655b] hover:bg-[#f0faf9] transition-colors disabled:opacity-60"
                >
                  <span className="font-medium text-gray-700">{t.name}</span>
                  <span className="text-xs text-gray-400">{t.targetTableName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface TableComponentProps {
  queryResult: QueryResult;
  onRowClick?: (row: Row) => void;
  /** Override displayed column keys */
  columns?: string[];
  pageSize?: number;
  /** tenantSlug + tableId enable the "Convert to →" row action */
  tenantSlug?: string;
  tableId?: string;
  /** Date columns that should offer relative-date filter operators */
  dateColumns?: string[];
}

export function TableComponent({
  queryResult,
  onRowClick,
  columns,
  pageSize = 20,
  tenantSlug,
  tableId,
  dateColumns = [],
}: TableComponentProps) {
  const [filterText, setFilterText] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState<DateFilter | null>(null);
  const [convertRow, setConvertRow] = useState<Row | null>(null);

  const cols = useMemo(() => {
    if (columns && columns.length > 0) return columns;
    const keys = new Set<string>();
    for (const row of queryResult.data) {
      for (const k of Object.keys(row)) keys.add(k);
    }
    return Array.from(keys).slice(0, 10);
  }, [queryResult.data, columns]);

  const filtered = useMemo(() => {
    let rows = queryResult.data;
    if (filterText) {
      const q = filterText.toLowerCase();
      rows = rows.filter((row) => cols.some((col) => String(row[col] ?? '').toLowerCase().includes(q)));
    }
    if (dateFilter) {
      rows = rows.filter((row) => matchesDateFilter(row, dateFilter));
    }
    return rows;
  }, [queryResult.data, filterText, cols, dateFilter]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
    setCurrentPage(1);
  };

  if (cols.length === 0) {
    return (
      <div className="rounded border border-gray-200 p-4 text-sm text-gray-400">
        No data
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden rounded border border-gray-200 bg-white">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
        <input
          type="search"
          placeholder="Filter…"
          value={filterText}
          onChange={handleFilterChange}
          className="h-7 w-40 rounded border border-gray-200 px-2 text-xs outline-none focus:border-[#15655b]"
        />
        {dateColumns.length > 0 && (
          <div className="flex items-center gap-1">
            <select
              value={dateFilter?.column ?? ''}
              onChange={(e) => {
                const col = e.target.value;
                if (!col) { setDateFilter(null); return; }
                setDateFilter({ column: col, operator: 'is_today' });
                setCurrentPage(1);
              }}
              className="h-7 rounded border border-gray-200 px-1.5 text-xs outline-none focus:border-[#15655b]"
              aria-label="Date column for relative filter"
            >
              <option value="">Date column…</option>
              {dateColumns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {dateFilter && (
              <select
                value={dateFilter.operator}
                onChange={(e) => {
                  setDateFilter((f) => f ? { ...f, operator: e.target.value as DateRelativeOperator } : null);
                  setCurrentPage(1);
                }}
                className="h-7 rounded border border-gray-200 px-1.5 text-xs outline-none focus:border-[#15655b]"
                aria-label="Date relative operator"
              >
                <option value="is_today">is today</option>
                <option value="is_this_week">is this week</option>
                <option value="is_this_month">is this month</option>
                <option value="is_overdue">is overdue</option>
              </select>
            )}
            {dateFilter && (
              <button
                type="button"
                onClick={() => { setDateFilter(null); setCurrentPage(1); }}
                className="h-7 rounded border border-gray-200 px-2 text-xs text-gray-500 hover:bg-gray-100"
                aria-label="Clear date filter"
              >
                ×
              </button>
            )}
          </div>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {sorted.length} row{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              {cols.map((col) => (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  className="cursor-pointer select-none whitespace-nowrap border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-100"
                >
                  {col}
                  {sortCol === col && (
                    <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
              {tenantSlug && tableId && (
                <th className="border-b border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-400 w-28">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'border-b border-gray-100 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-[#f0faf9]',
                )}
              >
                {cols.map((col) => (
                  <td key={col} className="max-w-xs truncate px-3 py-1.5 text-xs text-gray-700">
                    {formatCell(row[col])}
                  </td>
                ))}
                {tenantSlug && tableId && (
                  <td className="px-3 py-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setConvertRow(row)}
                      className="rounded border border-[#15655b] px-2 py-0.5 text-[10px] font-medium text-[#15655b] hover:bg-[#15655b] hover:text-white transition-colors"
                    >
                      Convert to →
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={cols.length}
                  className="py-8 text-center text-xs text-gray-400"
                >
                  No matching rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span>
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="rounded px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {/* Convert-to modal */}
      {convertRow && tenantSlug && tableId && (
        <ConvertToModal
          tenantSlug={tenantSlug}
          tableId={tableId}
          row={convertRow}
          onClose={() => setConvertRow(null)}
        />
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
