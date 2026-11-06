'use client';

import React, { useState, useMemo } from 'react';
import type { Row } from '@/types/runtime';

export interface CalendarProps {
  data: Row[];
  dateField: string;
  endDateField?: string;
  titleField: string;
  colorField?: string;
  view: 'month' | 'week';
  onEventClick?: (row: Row) => void;
  onDateClick?: (date: string) => void;
}

/** Returns number of days in a given month (1-indexed month). Exported for testing. */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Returns 7 ISO date strings for the week containing the given date. Exported for testing. */
export function getWeekDays(date: Date): string[] {
  const day = date.getDay(); // 0=Sun
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((day + 6) % 7)); // Monday start
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Groups rows by their date field value (ISO date string). Exported for testing. */
export function groupEventsByDate(rows: Row[], dateField: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const raw = String(row[dateField] ?? '');
    const dateStr = raw.slice(0, 10); // keep YYYY-MM-DD
    if (!dateStr || dateStr.length < 10) continue;
    const existing = map.get(dateStr);
    if (existing) {
      existing.push(row);
    } else {
      map.set(dateStr, [row]);
    }
  }
  return map;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8–20

export function CalendarComponent({
  data,
  dateField,
  titleField,
  colorField,
  view,
  onEventClick,
  onDateClick,
}: CalendarProps) {
  const [current, setCurrent] = useState(() => new Date());

  const eventsByDate = useMemo(() => groupEventsByDate(data, dateField), [data, dateField]);
  const todayStr = toISODate(new Date());

  const navigate = (dir: -1 | 1) => {
    setCurrent((prev: Date) => {
      const d = new Date(prev);
      if (view === 'month') {
        d.setMonth(d.getMonth() + dir);
      } else {
        d.setDate(d.getDate() + dir * 7);
      }
      return d;
    });
  };

  const headerLabel = view === 'month'
    ? `${MONTH_NAMES[current.getMonth()]} ${current.getFullYear()}`
    : (() => {
        const days = getWeekDays(current);
        return `Week of ${days[0]}`;
      })();

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
          aria-label="Previous"
        >
          ‹
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{headerLabel}</span>
          <button
            onClick={() => setCurrent(new Date())}
            className="text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Today
          </button>
        </div>
        <button
          onClick={() => navigate(1)}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
          aria-label="Next"
        >
          ›
        </button>
      </div>

      {view === 'month' ? (
        <MonthView
          current={current}
          eventsByDate={eventsByDate}
          todayStr={todayStr}
          titleField={titleField}
          colorField={colorField}
          onEventClick={onEventClick}
          onDateClick={onDateClick}
        />
      ) : (
        <WeekView
          current={current}
          eventsByDate={eventsByDate}
          todayStr={todayStr}
          titleField={titleField}
          colorField={colorField}
          onEventClick={onEventClick}
          onDateClick={onDateClick}
        />
      )}
    </div>
  );
}

interface ViewProps {
  current: Date;
  eventsByDate: Map<string, Row[]>;
  todayStr: string;
  titleField: string;
  colorField?: string;
  onEventClick?: (row: Row) => void;
  onDateClick?: (date: string) => void;
}

function MonthView({ current, eventsByDate, todayStr, titleField, colorField, onEventClick, onDateClick }: ViewProps) {
  const year = current.getFullYear();
  const month = current.getMonth(); // 0-indexed

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const startOffset = (firstDay + 6) % 7; // Mon=0
  const daysInMonth = getDaysInMonth(year, month + 1);

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // pad to 6 rows
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-1 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const dateStr = day
            ? `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            : null;
          const events = dateStr ? (eventsByDate.get(dateStr) ?? []) : [];
          const isToday = dateStr === todayStr;
          return (
            <div
              key={idx}
              className={`min-h-[80px] p-1 border-b border-r border-gray-100 dark:border-gray-800 ${day ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'}`}
              onClick={() => day && dateStr && onDateClick?.(dateStr)}
            >
              {day && (
                <>
                  <div className={`w-6 h-6 flex items-center justify-center text-xs rounded-full mb-1 ${isToday ? 'bg-indigo-600 text-white font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                    {day}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {events.slice(0, 3).map((row, i) => {
                      const color = colorField ? String(row[colorField] ?? '') : '';
                      return (
                        <div
                          key={i}
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEventClick?.(row); }}
                          className={`text-xs truncate rounded px-1 cursor-pointer ${color === 'red' ? 'bg-red-100 text-red-700' : color === 'green' ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}`}
                        >
                          {String(row[titleField] ?? '')}
                        </div>
                      );
                    })}
                    {events.length > 3 && (
                      <div className="text-xs text-gray-400">+{events.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ current, eventsByDate, todayStr, titleField, colorField, onEventClick, onDateClick }: ViewProps) {
  const weekDays = getWeekDays(current);

  return (
    <div className="overflow-auto max-h-[500px]">
      <div className="grid" style={{ gridTemplateColumns: '50px repeat(7, 1fr)' }}>
        {/* Header row */}
        <div className="border-b border-gray-200 dark:border-gray-700" />
        {weekDays.map((dateStr) => {
          const isToday = dateStr === todayStr;
          const dayNum = parseInt(dateStr.slice(8), 10);
          return (
            <div
              key={dateStr}
              className={`text-center py-1 border-b border-l border-gray-200 dark:border-gray-700 text-xs ${isToday ? 'bg-indigo-50 dark:bg-indigo-900 font-bold text-indigo-600' : 'text-gray-500 dark:text-gray-400'}`}
              onClick={() => onDateClick?.(dateStr)}
            >
              {DAY_NAMES[weekDays.indexOf(dateStr)]} {dayNum}
            </div>
          );
        })}

        {/* Hour rows */}
        {HOURS.map((hour) => (
          <React.Fragment key={hour}>
            <div className="text-right pr-1 py-2 text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
              {String(hour).padStart(2,'0')}:00
            </div>
            {weekDays.map((dateStr) => {
              const events = (eventsByDate.get(dateStr) ?? []).filter((row) => {
                const raw = String(row['startTime'] ?? '');
                return raw.startsWith(`${String(hour).padStart(2,'0')}:`);
              });
              return (
                <div
                  key={dateStr}
                  className="border-b border-l border-gray-100 dark:border-gray-800 p-0.5 min-h-[40px] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => onDateClick?.(dateStr)}
                >
                  {events.map((row, i) => {
                    const color = colorField ? String(row[colorField] ?? '') : '';
                    return (
                      <div
                        key={i}
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onEventClick?.(row); }}
                        className={`text-xs truncate rounded px-1 cursor-pointer ${color === 'red' ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}
                      >
                        {String(row[titleField] ?? '')}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
