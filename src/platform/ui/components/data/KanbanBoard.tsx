'use client';

import React, { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

export type Row = Record<string, unknown>;

export interface KanbanColumn {
  value: string;
  label: string;
  color?: string;
}

export interface KanbanProps {
  items: Row[];
  groupByField: string;
  columns?: KanbanColumn[];
  cardFields: string[];
  onMoveCard?: (itemId: string, newGroupValue: string) => Promise<void>;
  onCardClick?: (item: Row) => void;
  loading?: boolean;
}

const DEFAULT_COLORS = [
  '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899',
];

function SkeletonCard() {
  return (
    <div className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="mb-2 h-3 w-3/4 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-2 w-1/2 animate-pulse rounded bg-[var(--surface-2)]" />
    </div>
  );
}

export function KanbanBoard({ items, groupByField, columns: columnDefs, cardFields, onMoveCard, onCardClick, loading = false }: KanbanProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});

  // Build column list from items if not provided
  const cols: KanbanColumn[] = columnDefs ?? Array.from(
    new Set(items.map((r) => String(r[groupByField] ?? '')))
  ).map((v, i) => ({ value: v, label: v, color: DEFAULT_COLORS[i % DEFAULT_COLORS.length] }));

  const getItemGroup = (item: Row) => optimistic[String(item.id ?? '')] ?? String(item[groupByField] ?? '');

  const grouped = new Map<string, Row[]>();
  for (const col of cols) grouped.set(col.value, []);
  for (const item of items) {
    const g = getItemGroup(item);
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(item);
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, colValue: string) => {
    e.preventDefault();
    if (!draggingId) return;
    setOverCol(null);
    // Optimistic update
    setOptimistic((prev) => ({ ...prev, [draggingId]: colValue }));
    try {
      await onMoveCard?.(draggingId, colValue);
    } catch {
      setOptimistic((prev) => { const n = { ...prev }; delete n[draggingId]; return n; });
    }
    setDraggingId(null);
  };

  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-2">
      {cols.map((col) => {
        const colItems = grouped.get(col.value) ?? [];
        return (
          <div
            key={col.value}
            className={cn(
              'flex w-64 flex-shrink-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--surface-2)] transition-colors',
              overCol === col.value && 'ring-2 ring-[var(--accent)]',
            )}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.value); }}
            onDragLeave={() => setOverCol(null)}
            onDrop={(e) => handleDrop(e, col.value)}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 rounded-t-lg px-3 py-2.5" style={{ borderBottom: `2px solid ${col.color ?? '#6366f1'}` }}>
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: col.color ?? '#6366f1' }} />
              <span className="flex-1 text-xs font-semibold text-[var(--fg)]">{col.label || col.value}</span>
              <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-xs text-[var(--muted)]">{colItems.length}</span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
                : colItems.map((item) => {
                    const id = String(item.id ?? item._id ?? '');
                    return (
                      <div
                        key={id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, id)}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => onCardClick?.(item)}
                        className={cn(
                          'rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm transition-all cursor-pointer select-none',
                          'hover:shadow-md hover:border-[var(--accent)]/40',
                          draggingId === id && 'opacity-40 scale-95',
                        )}
                      >
                        {cardFields.map((f) => item[f] !== undefined && (
                          <div key={f} className="text-xs text-[var(--fg)] mb-0.5 last:mb-0">
                            <span className="text-[var(--muted)]">{f}: </span>
                            {String(item[f] ?? '')}
                          </div>
                        ))}
                      </div>
                    );
                  })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
