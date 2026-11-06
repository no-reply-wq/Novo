'use client';

import React, { useCallback, useRef, useState } from 'react';
import type { Row } from '@/types/runtime';

export interface KanbanProps {
  data: Row[];
  groupByField: string;
  columns?: string[];
  titleField: string;
  subtitleField?: string;
  colorField?: string;
  onCardClick?: (row: Row) => void;
  onCardMove?: (rowId: string, newStatus: string) => void;
}

/** Groups rows by a field value. Exported for testing. */
export function groupRows(rows: Row[], field: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row[field] ?? '(empty)');
    const existing = map.get(key);
    if (existing) {
      existing.push(row);
    } else {
      map.set(key, [row]);
    }
  }
  return map;
}

const BADGE_COLORS: Record<string, string> = {
  red: 'bg-red-100 text-red-800',
  green: 'bg-green-100 text-green-800',
  blue: 'bg-blue-100 text-blue-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  purple: 'bg-purple-100 text-purple-800',
  orange: 'bg-orange-100 text-orange-800',
};

function getBadgeClass(color?: string): string {
  if (!color) return 'bg-gray-100 text-gray-700';
  return BADGE_COLORS[color.toLowerCase()] ?? 'bg-gray-100 text-gray-700';
}

export function KanbanComponent({
  data,
  groupByField,
  columns,
  titleField,
  subtitleField,
  colorField,
  onCardClick,
  onCardMove,
}: KanbanProps) {
  const grouped = groupRows(data, groupByField);
  const dragRowId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Determine column order: use explicit columns or detected from data
  const colKeys = columns && columns.length > 0
    ? columns
    : Array.from(grouped.keys());

  // Ensure all explicit columns exist in map
  for (const col of colKeys) {
    if (!grouped.has(col)) grouped.set(col, []);
  }

  const handleDragStart = useCallback((rowId: string) => {
    dragRowId.current = rowId;
  }, []);

  const handleDrop = useCallback((colKey: string) => {
    if (dragRowId.current && onCardMove) {
      onCardMove(dragRowId.current, colKey);
    }
    dragRowId.current = null;
    setDragOver(null);
  }, [onCardMove]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 min-h-[200px]">
      {colKeys.map((col) => {
        const cards = grouped.get(col) ?? [];
        return (
          <div
            key={col}
            className={`flex-shrink-0 w-64 rounded-lg bg-gray-50 dark:bg-gray-800 p-2 flex flex-col gap-2 border ${dragOver === col ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900' : 'border-gray-200 dark:border-gray-700'}`}
            onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(col); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(col)}
          >
            <div className="flex items-center justify-between px-1 pb-1 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{col}</span>
              <span className="text-xs text-gray-400">{cards.length}</span>
            </div>
            {cards.map((row) => {
              const id = String(row['id'] ?? row['_id'] ?? JSON.stringify(row));
              const title = String(row[titleField] ?? '');
              const subtitle = subtitleField ? String(row[subtitleField] ?? '') : undefined;
              const color = colorField ? String(row[colorField] ?? '') : undefined;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={() => handleDragStart(id)}
                  onClick={() => onCardClick?.(row)}
                  className="cursor-pointer rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 p-2 shadow-sm hover:shadow-md transition-shadow select-none"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{title}</p>
                  {subtitle && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</p>
                  )}
                  {color && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getBadgeClass(color)}`}>
                      {color}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
