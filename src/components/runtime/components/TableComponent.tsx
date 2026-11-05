'use client';

import React, { useState, useMemo } from 'react';
import type { QueryResult, Row } from '@/types/runtime';
import { cn } from '@/lib/utils';

export interface TableComponentProps {
  queryResult: QueryResult;
  onRowClick?: (row: Row) => void;
  /** Override displayed column keys */
  columns?: string[];
  pageSize?: number;
}

export function TableComponent({ queryResult, onRowClick, columns, pageSize = 20 }: TableComponentProps) {
  const [filterText, setFilterText] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const cols = useMemo(() => {
    if (columns && columns.length > 0) return columns;
    const keys = new Set<string>();
    for (const row of queryResult.data) {
      for (const k of Object.keys(row)) keys.add(k);
    }
    return Array.from(keys).slice(0, 10);
  }, [queryResult.data, columns]);

  const filtered = useMemo(() => {
    if (!filterText) return queryResult.data;
    const q = filterText.toLowerCase();
    return queryResult.data.filter((row) =>
      cols.some((col) => String(row[col] ?? '').toLowerCase().includes(q)),
    );
  }, [queryResult.data, filterText, cols]);

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
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <input
          type="search"
          placeholder="Filter…"
          value={filterText}
          onChange={handleFilterChange}
          className="h-7 w-48 rounded border border-gray-200 px-2 text-xs outline-none focus:border-indigo-400"
        />
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
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'border-b border-gray-100 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-indigo-50',
                )}
              >
                {cols.map((col) => (
                  <td key={col} className="max-w-xs truncate px-3 py-1.5 text-xs text-gray-700">
                    {formatCell(row[col])}
                  </td>
                ))}
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
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
