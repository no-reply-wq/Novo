'use client';

/**
 * KanbanView — data-fetching wrapper around KanbanComponent.
 * Fetches rows from the platform rows API and passes them to KanbanComponent.
 * Handles moving cards between columns via PUT to the rows API.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { KanbanComponent } from './components/KanbanComponent';
import type { Row } from '@/types/runtime';

export interface KanbanViewProps {
  tenantSlug: string;
  tableId: string;
  tableSlug: string;
  groupByField: string;
  titleField: string;
  subtitleField?: string;
  statusOptions: string[];
}

interface ApiResponse {
  rows: Row[];
  total: number;
  error?: string;
}

export function KanbanView({
  tenantSlug,
  tableId,
  tableSlug,
  groupByField,
  titleField,
  subtitleField,
  statusOptions,
}: KanbanViewProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/platform/rows?tenant=${encodeURIComponent(tenantSlug)}&tableId=${encodeURIComponent(tableId)}&pageSize=500`,
      );
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) throw new Error(data.error ?? 'Failed to load rows');
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, tableId]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  const handleCardMove = useCallback(async (rowId: string, newStatus: string) => {
    // Optimistic update
    setRows((prev) =>
      prev.map((r) =>
        String(r['id']) === rowId ? { ...r, [groupByField]: newStatus } : r,
      ),
    );
    try {
      const res = await fetch(
        `/api/platform/rows?tenant=${encodeURIComponent(tenantSlug)}&tableId=${encodeURIComponent(tableId)}&rowId=${encodeURIComponent(rowId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { [groupByField]: newStatus } }),
        },
      );
      if (!res.ok) {
        // Revert on failure
        void fetchRows();
      }
    } catch {
      void fetchRows();
    }
  }, [tenantSlug, tableId, groupByField, fetchRows]);

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
        <button
          className="ml-3 underline"
          onClick={() => void fetchRows()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {rows.length} record{rows.length !== 1 ? 's' : ''} · grouped by{' '}
          <span className="font-medium">{groupByField}</span>
        </span>
        <button
          onClick={() => void fetchRows()}
          className="text-xs text-indigo-600 hover:underline"
        >
          Refresh
        </button>
      </div>
      <KanbanComponent
        data={rows}
        groupByField={groupByField}
        columns={statusOptions}
        titleField={titleField}
        subtitleField={subtitleField}
        onCardMove={(rowId, newStatus) => void handleCardMove(rowId, newStatus)}
      />
      {/* Add card hint */}
      <p className="mt-3 text-xs text-gray-400 text-center">
        Drag cards between columns to change status · Use the table view to add new records
      </p>
    </div>
  );
}
