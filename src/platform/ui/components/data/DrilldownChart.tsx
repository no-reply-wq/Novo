'use client';

import React, { useState, useCallback } from 'react';
import { ChartComponent } from './ChartComponent';
import type { DrilldownConfig, DrilldownResult } from '@/platform/analytics/drilldown';

interface DrilldownChartProps {
  config: DrilldownConfig;
  appId: string;
  tenantSlug: string;
  title?: string;
}

interface BreadcrumbEntry {
  level: number;
  label: string;
  filters: Record<string, unknown>;
}

export function DrilldownChart({ config, appId, tenantSlug, title }: DrilldownChartProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DrilldownResult | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([
    { level: 0, label: title ?? config.sourceMetric, filters: {} },
  ]);

  const fetchLevel = useCallback(
    async (level: number, filters: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/runtime/analytics/drilldown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config, level, filters, appId, tenantSlug }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as DrilldownResult;
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [config, appId, tenantSlug],
  );

  React.useEffect(() => {
    void fetchLevel(0, {});
  }, [fetchLevel]);

  const handleBarClick = useCallback(
    (label: string) => {
      if (!result) return;
      const row = result.rows.find((r) => r.label === label);
      if (!row || !row.hasChildren) return;

      const nextLevel = result.level + 1;
      const nextLabel = config.drilldownLevels[result.level]?.label ?? label;

      setBreadcrumbs((prev) => [
        ...prev,
        { level: nextLevel, label: nextLabel, filters: row.filter },
      ]);
      void fetchLevel(nextLevel, row.filter);
    },
    [result, config.drilldownLevels, fetchLevel],
  );

  const handleBreadcrumbClick = useCallback(
    (entry: BreadcrumbEntry) => {
      setBreadcrumbs((prev) => prev.slice(0, prev.findIndex((b) => b.level === entry.level) + 1));
      void fetchLevel(entry.level, entry.filters);
    },
    [fetchLevel],
  );

  const handleBack = useCallback(() => {
    if (breadcrumbs.length <= 1) return;
    const prev = breadcrumbs[breadcrumbs.length - 2];
    setBreadcrumbs((b) => b.slice(0, -1));
    void fetchLevel(prev.level, prev.filters);
  }, [breadcrumbs, fetchLevel]);

  const chartData = (result?.rows ?? []).map((r) => ({ label: r.label, value: r.value }));

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center gap-1 text-xs text-[var(--muted)] flex-wrap">
        {breadcrumbs.map((b, i) => (
          <React.Fragment key={b.level}>
            {i > 0 && <span className="text-[var(--muted)]">›</span>}
            <button
              onClick={() => handleBreadcrumbClick(b)}
              className={`hover:text-[var(--fg)] transition-colors ${i === breadcrumbs.length - 1 ? 'text-[var(--fg)] font-medium' : 'hover:underline'}`}
            >
              {b.label}
            </button>
          </React.Fragment>
        ))}
        {loading && <span className="ml-2 text-[var(--muted)] animate-pulse">Loading…</span>}
      </div>

      {breadcrumbs.length > 1 && (
        <button
          onClick={handleBack}
          className="self-start text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-colors"
        >
          Back
        </button>
      )}

      {error && (
        <div className="text-xs text-red-500 p-2 rounded border border-red-200 bg-red-50">{error}</div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <div className="flex-1 min-h-0">
          <ChartComponent
            type="bar"
            data={chartData}
            title={result?.groupBy}
            onBarClick={handleBarClick}
          />
        </div>
      )}

      {!loading && !error && chartData.length === 0 && (
        <div className="flex items-center justify-center flex-1 text-xs text-[var(--muted)]">
          No data available
        </div>
      )}
    </div>
  );
}
