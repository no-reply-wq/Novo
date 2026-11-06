'use client';

/**
 * CalendarView — data-fetching wrapper around CalendarComponent.
 * Fetches rows from the platform rows API filtered by the current month's date range,
 * and passes them to CalendarComponent.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarComponent } from './components/CalendarComponent';
import type { Row } from '@/types/runtime';

export interface CalendarViewProps {
  tenantSlug: string;
  tableId: string;
  dateField: string;
  titleField: string;
  colorField?: string;
}

interface ApiResponse {
  rows: Row[];
  error?: string;
}

export function CalendarView({
  tenantSlug,
  tableId,
  dateField,
  titleField,
  colorField,
}: CalendarViewProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'month' | 'week'>('month');
  const [selectedEvent, setSelectedEvent] = useState<Row | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all rows — the CalendarComponent will group them by date
      const res = await fetch(
        `/api/platform/rows?tenant=${encodeURIComponent(tenantSlug)}&tableId=${encodeURIComponent(tableId)}&pageSize=500&sort=${encodeURIComponent(dateField)}&dir=asc`,
      );
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) throw new Error(data.error ?? 'Failed to load rows');
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, tableId, dateField]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
        <button className="ml-3 underline" onClick={() => void fetchRows()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === v
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => void fetchRows()} className="text-xs text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>

      <CalendarComponent
        data={rows}
        dateField={dateField}
        titleField={titleField}
        colorField={colorField}
        view={view}
        onEventClick={(row) => setSelectedEvent(row)}
      />

      {/* Event detail modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {String(selectedEvent[titleField] ?? 'Event')}
              </h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <dl className="space-y-2">
              {Object.entries(selectedEvent)
                .filter(([k]) => !k.startsWith('_') && k !== 'id')
                .slice(0, 8)
                .map(([k, v]) => (
                  <div key={k} className="flex gap-3 text-sm">
                    <dt className="w-28 flex-shrink-0 text-gray-500 dark:text-gray-400 capitalize">
                      {k.replace(/_/g, ' ')}
                    </dt>
                    <dd className="text-gray-900 dark:text-gray-100 truncate">
                      {v === null || v === undefined ? '—' : String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
