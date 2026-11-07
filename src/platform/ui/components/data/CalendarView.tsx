'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

export type Row = Record<string, unknown>;

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  color?: string;
  data: Row;
}

export interface CalendarProps {
  events: CalendarEvent[];
  view?: 'month' | 'week' | 'day';
  onEventClick?: (event: { id: string; data: Row }) => void;
  onDateClick?: (date: Date) => void;
  loading?: boolean;
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function startOfWeek(d: Date) {
  const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function CalendarView({ events, view: initialView = 'month', onEventClick, onDateClick, loading = false }: CalendarProps) {
  const [view, setView] = useState<'month' | 'week' | 'day'>(initialView);
  const [current, setCurrent] = useState(() => new Date());

  const eventsOnDay = (day: Date) =>
    events.filter((e) => {
      const start = new Date(e.start);
      const end = e.end ? new Date(e.end) : start;
      const d = new Date(day); d.setHours(0,0,0,0);
      const s = new Date(start); s.setHours(0,0,0,0);
      const en = new Date(end); en.setHours(23,59,59,999);
      return d >= s && d <= en;
    });

  const navigate = (dir: -1 | 1) => {
    setCurrent((prev) => {
      const d = new Date(prev);
      if (view === 'month') d.setMonth(d.getMonth() + dir);
      else if (view === 'week') d.setDate(d.getDate() + dir * 7);
      else d.setDate(d.getDate() + dir);
      return d;
    });
  };

  const title = useMemo(() => {
    if (view === 'month') return `${MONTHS[current.getMonth()]} ${current.getFullYear()}`;
    if (view === 'week') {
      const ws = startOfWeek(current);
      const we = addDays(ws, 6);
      return `${ws.toLocaleDateString()} – ${we.toLocaleDateString()}`;
    }
    return current.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, [view, current]);

  // Month grid
  const monthDays = useMemo(() => {
    const start = startOfMonth(current);
    const firstWeekday = start.getDay();
    const days: Date[] = [];
    for (let i = 0; i < firstWeekday; i++) days.push(addDays(start, i - firstWeekday));
    const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    for (let i = 0; i < daysInMonth; i++) days.push(addDays(start, i));
    while (days.length % 7 !== 0) days.push(addDays(days[days.length - 1], 1));
    return days;
  }, [current]);

  // Week days
  const weekDays = useMemo(() => {
    const ws = startOfWeek(current);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [current]);

  const today = new Date();

  const EventPill = ({ event }: { event: CalendarEvent }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onEventClick?.({ id: event.id, data: event.data }); }}
      className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-white mb-0.5"
      style={{ background: event.color ?? '#6366f1' }}
      title={event.title}
    >
      {event.title}
    </button>
  );

  return (
    <div className="flex h-full flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
        <button onClick={() => navigate(-1)} className="rounded px-2 py-1 text-xs hover:bg-[var(--surface-2)]">←</button>
        <span className="flex-1 text-center text-sm font-semibold">{title}</span>
        <button onClick={() => navigate(1)} className="rounded px-2 py-1 text-xs hover:bg-[var(--surface-2)]">→</button>
        <button onClick={() => setCurrent(new Date())} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-2)]">Today</button>
        <div className="flex rounded border border-[var(--border)] overflow-hidden text-xs">
          {(['month','week','day'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={cn('px-2 py-1 capitalize', view === v ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--surface-2)]')}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-[var(--muted)]">Loading…</div>
      ) : view === 'month' ? (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-7 border-b border-[var(--border)]">
            {DAYS.map((d) => (
              <div key={d} className="border-r border-[var(--border)] px-2 py-1 text-center text-xs font-semibold text-[var(--muted)] last:border-r-0">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7" style={{ gridAutoRows: 'minmax(80px, 1fr)' }}>
            {monthDays.map((day, i) => {
              const isCurrentMonth = day.getMonth() === current.getMonth();
              const isToday = isSameDay(day, today);
              const dayEvents = eventsOnDay(day);
              return (
                <div key={i} onClick={() => onDateClick?.(day)}
                  className={cn(
                    'border-b border-r border-[var(--border)] p-1 last:border-r-0 cursor-pointer hover:bg-[var(--surface-2)] overflow-hidden',
                    !isCurrentMonth && 'opacity-30',
                  )}>
                  <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full text-xs', isToday && 'bg-[var(--accent)] text-white font-bold')}>
                    {day.getDate()}
                  </span>
                  <div className="mt-0.5">
                    {dayEvents.slice(0, 3).map((ev) => <EventPill key={ev.id} event={ev} />)}
                    {dayEvents.length > 3 && <span className="text-[9px] text-[var(--muted)]">+{dayEvents.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === 'week' ? (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-7 border-b border-[var(--border)]">
            {weekDays.map((day, i) => (
              <div key={i} className="border-r border-[var(--border)] p-2 last:border-r-0">
                <div className={cn('text-center text-xs font-semibold', isSameDay(day, today) && 'text-[var(--accent)]')}>
                  {DAYS[day.getDay()]} {day.getDate()}
                </div>
                <div className="mt-1">
                  {eventsOnDay(day).map((ev) => <EventPill key={ev.id} event={ev} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <div className="mb-2 text-sm font-semibold">{current.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          {eventsOnDay(current).length === 0
            ? <p className="text-xs text-[var(--muted)]">No events</p>
            : eventsOnDay(current).map((ev) => (
              <button key={ev.id} onClick={() => onEventClick?.({ id: ev.id, data: ev.data })}
                className="mb-2 w-full rounded-lg border border-[var(--border)] p-3 text-left hover:bg-[var(--surface-2)]"
                style={{ borderLeftColor: ev.color ?? '#6366f1', borderLeftWidth: 4 }}>
                <div className="text-sm font-medium text-[var(--fg)]">{ev.title}</div>
                <div className="text-xs text-[var(--muted)]">{new Date(ev.start).toLocaleTimeString()}{ev.end && ` – ${new Date(ev.end).toLocaleTimeString()}`}</div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
