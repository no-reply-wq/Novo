'use client';

import React, { useState, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';

export type Row = Record<string, unknown>;

export interface TimelineItem {
  id: string;
  label: string;
  start: Date;
  end: Date;
  color?: string;
  group?: string;
  data: Row;
}

export interface TimelineProps {
  items: TimelineItem[];
  startDate: Date;
  endDate: Date;
  groupBy?: string;
  onItemClick?: (item: { id: string; data: Row }) => void;
}

type Granularity = 'day' | 'week' | 'month';

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function diffDays(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

function buildTicks(start: Date, end: Date, gran: Granularity): Date[] {
  const ticks: Date[] = [];
  if (gran === 'day') {
    let d = new Date(start); d.setHours(0,0,0,0);
    while (d <= end) { ticks.push(new Date(d)); d = addDays(d, 1); }
  } else if (gran === 'week') {
    let d = startOfWeek(start);
    while (d <= end) { ticks.push(new Date(d)); d = addDays(d, 7); }
  } else {
    let d = startOfMonth(start);
    while (d <= end) { ticks.push(new Date(d)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  }
  return ticks;
}

function formatTick(d: Date, gran: Granularity) {
  if (gran === 'day') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (gran === 'week') return `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString(undefined, { month: 'short' })}`;
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

const ROW_HEIGHT = 36;
const LABEL_WIDTH = 160;

export function TimelineView({ items, startDate, endDate, groupBy, onItemClick }: TimelineProps) {
  const [gran, setGran] = useState<Granularity>('week');
  const totalDays = Math.max(1, diffDays(startDate, endDate));
  const ticks = useMemo(() => buildTicks(startDate, endDate, gran), [startDate, endDate, gran]);

  // px per day
  const pxPerDay = gran === 'day' ? 40 : gran === 'week' ? 24 : 8;
  const totalWidth = totalDays * pxPerDay;

  const groups = useMemo(() => {
    if (!groupBy) return [{ name: '', items }];
    const map = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const g = item.group ?? '';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return Array.from(map.entries()).map(([name, its]) => ({ name, items: its }));
  }, [items, groupBy]);

  const getBar = (item: TimelineItem) => {
    const s = Math.max(0, diffDays(startDate, item.start));
    const e = Math.min(totalDays, diffDays(startDate, item.end));
    const left = s * pxPerDay;
    const width = Math.max(4, (e - s) * pxPerDay);
    return { left, width };
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]">
      {/* Controls */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
        <span className="text-sm font-semibold flex-1">Timeline</span>
        <span className="text-xs text-[var(--muted)]">Zoom:</span>
        {(['day','week','month'] as Granularity[]).map((g) => (
          <button key={g} onClick={() => setGran(g)}
            className={cn('rounded px-2 py-0.5 text-xs capitalize', gran === g ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)] hover:bg-[var(--surface-2)]')}>
            {g}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Label column */}
        <div className="flex-shrink-0 overflow-y-auto border-r border-[var(--border)]" style={{ width: LABEL_WIDTH }}>
          <div className="border-b border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]" style={{ height: 36 }}>Name</div>
          {groups.map((group) => (
            <React.Fragment key={group.name}>
              {group.name && (
                <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--fg)]">{group.name}</div>
              )}
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center border-b border-[var(--border)] px-3 text-xs text-[var(--fg)] truncate" style={{ height: ROW_HEIGHT }}>
                  {item.label}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        {/* Gantt area */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth + 32, minWidth: '100%' }}>
            {/* Tick header */}
            <div className="sticky top-0 z-10 flex border-b border-[var(--border)] bg-[var(--surface-2)]" style={{ height: 36 }}>
              {ticks.map((tick, i) => (
                <div key={i} className="flex-shrink-0 border-r border-[var(--border)] px-1 text-[10px] text-[var(--muted)] flex items-center"
                  style={{ width: gran === 'day' ? pxPerDay : gran === 'week' ? pxPerDay * 7 : pxPerDay * 30 }}>
                  {formatTick(tick, gran)}
                </div>
              ))}
            </div>

            {/* Rows */}
            {groups.map((group) => (
              <React.Fragment key={group.name}>
                {group.name && (
                  <div className="border-b border-[var(--border)] bg-[var(--surface-2)]" style={{ height: 28 }} />
                )}
                {group.items.map((item) => {
                  const { left, width } = getBar(item);
                  return (
                    <div key={item.id} className="relative border-b border-[var(--border)]" style={{ height: ROW_HEIGHT }}>
                      {/* Grid lines */}
                      {ticks.map((_, i) => (
                        <div key={i} className="absolute top-0 bottom-0 w-px bg-[var(--border)]/30"
                          style={{ left: i * (gran === 'day' ? pxPerDay : gran === 'week' ? pxPerDay * 7 : pxPerDay * 30) }} />
                      ))}
                      {/* Bar */}
                      <button
                        onClick={() => onItemClick?.({ id: item.id, data: item.data })}
                        className="absolute top-1/2 -translate-y-1/2 flex items-center rounded px-1.5 text-[10px] font-medium text-white truncate hover:opacity-80 transition-opacity"
                        style={{ left, width, background: item.color ?? '#6366f1', height: ROW_HEIGHT - 10 }}
                        title={item.label}
                      >
                        {item.label}
                      </button>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
