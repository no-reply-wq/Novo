'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowRun {
  id: string;
  workflow_id: string;
  tenant_slug: string;
  trigger_event: string;
  status: 'success' | 'failed' | 'running';
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  error: string | null;
  step_results?: unknown[];
}

const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WorkflowRun['status'] }) {
  const configs: Record<
    WorkflowRun['status'],
    { color: string; bg: string; Icon: React.ElementType; label: string }
  > = {
    success: { color: '#16a34a', bg: '#dcfce7', Icon: CheckCircle, label: 'Success' },
    failed: { color: '#dc2626', bg: '#fee2e2', Icon: XCircle, label: 'Failed' },
    running: { color: '#009A8A', bg: '#ccfbf1', Icon: Clock, label: 'Running' },
  };
  const cfg = configs[status] ?? configs.failed;
  const Icon = cfg.Icon;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
      }}
    >
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

// ─── Step results viewer ──────────────────────────────────────────────────────

function StepResultsViewer({ results }: { results: unknown[] }) {
  if (!results || results.length === 0) {
    return (
      <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 0' }}>
        No step results recorded.
      </p>
    );
  }
  return (
    <pre
      style={{
        margin: '8px 0 0',
        padding: '10px 12px',
        background: '#0f172a',
        color: '#e2e8f0',
        borderRadius: 6,
        fontSize: 11,
        overflowX: 'auto',
        maxHeight: 320,
        overflowY: 'auto',
        lineHeight: 1.6,
      }}
    >
      {JSON.stringify(results, null, 2)}
    </pre>
  );
}

// ─── Run row ──────────────────────────────────────────────────────────────────

function RunRow({ run }: { run: WorkflowRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded((p) => !p)}
        style={{
          cursor: 'pointer',
          borderBottom: '1px solid #e2e8f0',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLTableRowElement).style.background = '';
        }}
      >
        <td style={{ padding: '10px 14px', fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>
          {expanded ? (
            <ChevronDown size={14} style={{ verticalAlign: 'middle' }} />
          ) : (
            <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
          )}
        </td>
        <td style={{ padding: '10px 14px', fontSize: 13, whiteSpace: 'nowrap' }}>
          {formatDate(run.started_at)}
        </td>
        <td style={{ padding: '10px 14px' }}>
          <StatusBadge status={run.status} />
        </td>
        <td style={{ padding: '10px 14px', fontSize: 13, color: '#475569', whiteSpace: 'nowrap' }}>
          {formatDuration(run.duration_ms)}
        </td>
        <td style={{ padding: '10px 14px', fontSize: 13, color: '#475569' }}>
          <code
            style={{
              background: '#f1f5f9',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            {run.trigger_event}
          </code>
        </td>
        {run.error && (
          <td style={{ padding: '10px 14px', fontSize: 12, color: '#dc2626', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {run.error}
          </td>
        )}
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
          <td colSpan={6} style={{ padding: '0 14px 14px 42px', background: '#f8fafc' }}>
            <p style={{ margin: '8px 0 4px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Step Results
            </p>
            <StepResultsViewer results={(run.step_results as unknown[]) ?? []} />
            {run.error && (
              <>
                <p style={{ margin: '10px 0 4px', fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Error
                </p>
                <pre style={{ margin: 0, padding: '8px 10px', background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#991b1b', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {run.error}
                </pre>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkflowRunsPage() {
  const { appId, workflowId } = useParams<{ appId: string; workflowId: string }>();
  const searchParams = useSearchParams();
  const tenant = searchParams.get('tenant') ?? '';

  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/builder/apps/${appId}/workflows/${workflowId}/runs?tenant=${tenant}`
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { runs: WorkflowRun[] };
      setRuns(data.runs ?? []);
      setPage(0);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [appId, workflowId, tenant]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.ceil(runs.length / PAGE_SIZE);
  const pageRuns = runs.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Zap size={20} color="#009A8A" />
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, flex: 1 }}>
          Workflow Run History
        </h1>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 13,
            color: '#475569',
          }}
        >
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          Refresh
        </button>
      </div>

      {/* Stats strip */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {(['success', 'failed', 'running'] as const).map((s) => {
            const count = runs.filter((r) => r.status === s).length;
            const colors: Record<string, string> = {
              success: '#009A8A',
              failed: '#dc2626',
              running: '#f59e0b',
            };
            return (
              <div
                key={s}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  background: '#fff',
                }}
              >
                <p style={{ margin: 0, fontSize: 11, color: '#64748b', textTransform: 'capitalize', fontWeight: 600, letterSpacing: '0.06em' }}>
                  {s}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: colors[s] }}>
                  {count}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>Loading runs…</div>
      ) : error ? (
        <div style={{ padding: 20, color: '#dc2626', background: '#fee2e2', borderRadius: 8 }}>
          {error}
        </div>
      ) : runs.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            color: '#94a3b8',
            border: '1px dashed #e2e8f0',
            borderRadius: 10,
          }}
        >
          No runs yet. This workflow has not been triggered.
        </div>
      ) : (
        <>
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 14px', width: 32 }} />
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                    Started At
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Status
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Duration
                  </th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Trigger Event
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRuns.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 16,
              }}
            >
              <span style={{ fontSize: 13, color: '#64748b' }}>
                Page {page + 1} of {totalPages} ({runs.length} total)
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: page === 0 ? '#f1f5f9' : '#fff',
                    cursor: page === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    color: page === 0 ? '#94a3b8' : '#475569',
                  }}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    background: page === totalPages - 1 ? '#f1f5f9' : '#fff',
                    cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    color: page === totalPages - 1 ? '#94a3b8' : '#475569',
                  }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
