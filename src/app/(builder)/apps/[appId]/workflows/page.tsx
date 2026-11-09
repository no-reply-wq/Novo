'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { WorkflowDef, TriggerEvent } from '@/platform/contracts/rules';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  triggerEvent: TriggerEvent;
  stepCount: number;
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: 'ok' | 'error' | 'running';
}

const TRIGGER_LABELS: Record<TriggerEvent, string> = {
  record_created: 'Record Created',
  record_updated: 'Record Updated',
  record_deleted: 'Record Deleted',
  field_changed: 'Field Changed',
  status_changed: 'Status Changed',
  approval_decided: 'Approval Decided',
  form_submitted: 'Form Submitted',
  button_clicked: 'Button Clicked',
  schedule: 'Schedule',
  webhook_incoming: 'Webhook Incoming',
  whatsapp_message: 'WhatsApp Message',
  email_received: 'Email Received',
};

function TriggerBadge({ event }: { event: TriggerEvent }) {
  const label = TRIGGER_LABELS[event] ?? event;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        background: 'var(--accent-muted, #ede9fe)',
        color: 'var(--accent, #6366f1)',
        border: '1px solid var(--accent-border, #c4b5fd)',
      }}
    >
      {label}
    </span>
  );
}

function StatusDot({ status }: { status?: string }) {
  const color =
    status === 'ok'
      ? '#22c55e'
      : status === 'error'
        ? '#ef4444'
        : status === 'running'
          ? '#f59e0b'
          : '#94a3b8';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
      title={status ?? 'Never run'}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const { appId } = useParams<{ appId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenant = searchParams.get('tenant') ?? '';
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/workflows?tenant=${tenant}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { workflows: WorkflowSummary[] };
      setWorkflows(data.workflows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  // Trigger initial load when appId changes; `load` is stable per appId.
  const loadRef = useRef(load);
  useLayoutEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    loadRef.current().catch((e: unknown) => setError(String(e)));
  }, [appId]);

  async function toggleEnabled(id: string, enabled: boolean) {
    setWorkflows((ws) => ws.map((w) => (w.id === id ? { ...w, enabled } : w)));
    await fetch(`/api/builder/apps/${appId}/workflows/${id}?tenant=${tenant}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }

  async function createWorkflow() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/workflows?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { workflow: WorkflowDef };
      router.push(`/apps/${appId}/workflows/${data.workflow.id}?tenant=${tenant}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Workflows</h1>
          <p style={{ color: 'var(--muted-fg, #64748b)', fontSize: 13, margin: '4px 0 0' }}>
            Automate actions when data changes or events occur.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'var(--accent, #6366f1)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 500,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          + New Workflow
        </button>
      </div>

      {/* New workflow inline */}
      {showNew && (
        <div
          style={{
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            background: 'var(--card-bg, #fff)',
          }}
        >
          <p style={{ margin: '0 0 10px', fontWeight: 500, fontSize: 14 }}>New workflow</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createWorkflow();
                if (e.key === 'Escape') setShowNew(false);
              }}
              placeholder="Workflow name…"
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 6,
                fontSize: 13,
                background: 'var(--input-bg, #f8fafc)',
                color: 'var(--foreground, #0f172a)',
              }}
            />
            <button
              onClick={() => void createWorkflow()}
              disabled={creating || !newName.trim()}
              style={{
                padding: '8px 14px',
                background: 'var(--accent, #6366f1)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 13,
                cursor: creating ? 'wait' : 'pointer',
                opacity: !newName.trim() ? 0.6 : 1,
              }}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => setShowNew(false)}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--muted-fg, #64748b)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#dc2626',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          style={{ textAlign: 'center', padding: 40, color: 'var(--muted-fg, #64748b)', fontSize: 14 }}
        >
          Loading workflows…
        </div>
      )}

      {/* Empty */}
      {!loading && workflows.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            border: '1px dashed var(--border, #e2e8f0)',
            borderRadius: 8,
            color: 'var(--muted-fg, #64748b)',
          }}
        >
          <div style={{ marginBottom: 12 }}><svg width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='#94a3b8' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'><polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2'/></svg></div>
          <p style={{ margin: 0, fontWeight: 500 }}>No workflows yet</p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            Create your first workflow to automate data operations.
          </p>
        </div>
      )}

      {/* Workflow cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {workflows.map((wf) => (
          <div
            key={wf.id}
            onClick={() => router.push(`/apps/${appId}/workflows/${wf.id}?tenant=${tenant}`)}
            style={{
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 8,
              padding: '14px 16px',
              background: 'var(--card-bg, #fff)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                '0 2px 8px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
            }}
          >
            <StatusDot status={wf.lastRunStatus} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontWeight: 500, fontSize: 14 }}>{wf.name}</span>
                <TriggerBadge event={wf.triggerEvent} />
              </div>
              {wf.description && (
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 12,
                    color: 'var(--muted-fg, #64748b)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {wf.description}
                </p>
              )}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--muted-fg, #64748b)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {wf.stepCount} step{wf.stepCount !== 1 ? 's' : ''}
            </div>
            {/* Enabled toggle */}
            <div
              role="switch"
              aria-checked={wf.enabled}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                void toggleEnabled(wf.id, !wf.enabled);
              }}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.stopPropagation();
                  void toggleEnabled(wf.id, !wf.enabled);
                }
              }}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: wf.enabled ? 'var(--accent, #6366f1)' : '#cbd5e1',
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'background 0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: wf.enabled ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
