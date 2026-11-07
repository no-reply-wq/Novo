'use client';
import React, { useState } from 'react';
import { cn } from '@/lib/utils';

export interface DateRange { from: Date; to: Date; }

export interface DateRelativeFilterProps {
  onChange: (range: DateRange) => void;
  className?: string;
}

function today() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function endOfDay(d: Date) { const r = new Date(d); r.setHours(23,59,59,999); return r; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0,0,0,0); return r; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due-today', label: 'Due today' },
  { key: 'due-this-week', label: 'Due this week' },
  { key: 'custom', label: 'Custom…' },
] as const;

type PresetKey = typeof PRESETS[number]['key'];

function resolveRange(key: PresetKey): DateRange | null {
  const t = today();
  if (key === 'today') return { from: t, to: endOfDay(t) };
  if (key === 'yesterday') { const y = addDays(t, -1); return { from: y, to: endOfDay(y) }; }
  if (key === 'this-week') return { from: startOfWeek(t), to: endOfDay(addDays(startOfWeek(t), 6)) };
  if (key === 'last-week') { const lws = addDays(startOfWeek(t), -7); return { from: lws, to: endOfDay(addDays(lws, 6)) }; }
  if (key === 'this-month') return { from: startOfMonth(t), to: endOfMonth(t) };
  if (key === 'last-month') { const lm = new Date(t.getFullYear(), t.getMonth() - 1, 1); return { from: lm, to: endOfMonth(lm) }; }
  if (key === 'overdue') return { from: new Date(0), to: addDays(t, -1) };
  if (key === 'due-today') return { from: t, to: endOfDay(t) };
  if (key === 'due-this-week') return { from: t, to: endOfDay(addDays(startOfWeek(t), 6)) };
  return null;
}

export function DateRelativeFilter({ onChange, className }: DateRelativeFilterProps) {
  const [selected, setSelected] = useState<PresetKey>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const handleSelect = (key: PresetKey) => {
    setSelected(key);
    if (key !== 'custom') {
      const range = resolveRange(key);
      if (range) onChange(range);
    }
  };

  const applyCustom = () => {
    if (customFrom && customTo) {
      onChange({ from: new Date(customFrom), to: new Date(customTo + 'T23:59:59') });
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {PRESETS.map((p) => (
        <button key={p.key} onClick={() => handleSelect(p.key)}
          className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors',
            selected === p.key ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg)] hover:border-[var(--accent)]')}>
          {p.label}
        </button>
      ))}
      {selected === 'custom' && (
        <div className="flex items-center gap-1">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs outline-none focus:border-[var(--accent)]" />
          <span className="text-xs text-[var(--muted)]">–</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs outline-none focus:border-[var(--accent)]" />
          <button onClick={applyCustom} className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs text-white">Apply</button>
        </div>
      )}
    </div>
  );
}
