'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { ApprovalRequest, ApprovalFlow, ApprovalLevel } from '@/platform/workflows/approvals';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ApprovalInboxProps {
  tenantSlug: string;
  userId: string;
  userRoles: string[];
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApprovalRequest['status'] }) {
  const colorMap: Record<ApprovalRequest['status'], string> = {
    pending: '#d97706',
    approved: '#16a34a',
    rejected: '#dc2626',
    timed_out: '#6b7280',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        background: colorMap[status],
        textTransform: 'capitalize',
      }}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

// ─── Approval chain progress ──────────────────────────────────────────────────

function ApprovalChainProgress({
  flow,
  currentLevel,
}: {
  flow: ApprovalFlow;
  currentLevel: number;
}) {
  const levels = [...flow.levels].sort((a, b) => a.order - b.order);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {levels.map((lvl, idx) => {
        const done = lvl.order < currentLevel;
        const active = lvl.order === currentLevel;
        return (
          <React.Fragment key={lvl.order}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                  border: active ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  background: done ? '#16a34a' : active ? '#eff6ff' : '#f8fafc',
                  color: done ? '#fff' : active ? '#3b82f6' : '#94a3b8',
                }}
              >
                {done ? '✓' : lvl.order}
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: active ? '#3b82f6' : '#94a3b8',
                  maxWidth: 60,
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={lvl.approverValue}
              >
                {lvl.approverType === 'role' ? `Role: ${lvl.approverValue}` : lvl.approverValue}
              </span>
            </div>
            {idx < levels.length - 1 && (
              <div
                style={{
                  height: 2,
                  width: 24,
                  background: done ? '#16a34a' : '#e2e8f0',
                  marginBottom: 14,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Single approval card ─────────────────────────────────────────────────────

interface ApprovalCardProps {
  request: ApprovalRequest;
  onDecide: (requestId: string, decision: 'approved' | 'rejected', comment: string) => Promise<void>;
  submitting: boolean;
}

function ApprovalCard({ request, onDecide, submitting }: ApprovalCardProps) {
  const [comment, setComment] = useState('');
  const [expanded, setExpanded] = useState(false);
  const flow = request.configSnapshot;

  const currentLevelDef = flow.levels.find((l: ApprovalLevel) => l.order === request.currentLevel);

  return (
    <div
      style={{
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 10,
        padding: 16,
        background: 'var(--card-bg, #fff)',
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--fg, #0f172a)', marginBottom: 4 }}>
            {flow.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted-fg, #64748b)' }}>
            Record: <code>{request.recordId}</code> &nbsp;·&nbsp; Run: <code>{request.workflowRunId.slice(0, 12)}…</code>
          </div>
          {request.timeoutAt && (
            <div style={{ fontSize: 12, color: '#d97706', marginTop: 2 }}>
              Expires: {new Date(request.timeoutAt).toLocaleString()}
            </div>
          )}
        </div>
        <StatusBadge status={request.status} />
      </div>

      {/* Chain progress */}
      {flow.levels.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <ApprovalChainProgress flow={flow} currentLevel={request.currentLevel} />
        </div>
      )}

      {/* Current level info */}
      {currentLevelDef && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted-fg, #64748b)' }}>
          Current approver: <strong>{currentLevelDef.approverType === 'role' ? `Anyone with role "${currentLevelDef.approverValue}"` : currentLevelDef.approverValue}</strong>
          {' '}&nbsp;·&nbsp; Requires {currentLevelDef.requiredCount} approval{currentLevelDef.requiredCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Decision history */}
      {request.decisions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setExpanded((e) => !e)}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              fontSize: 13,
              padding: 0,
            }}
          >
            {expanded ? '▲ Hide' : '▼ Show'} history ({request.decisions.length})
          </button>
          {expanded && (
            <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none', fontSize: 13 }}>
              {request.decisions.map((d) => (
                <li key={d.id} style={{ marginBottom: 4, color: 'var(--muted-fg, #64748b)' }}>
                  <StatusBadge status={d.decision === 'approved' ? 'approved' : 'rejected'} />
                  {' '}{d.approverId} at level {d.level}
                  {d.comment && <em> — "{d.comment}"</em>}
                  <span style={{ marginLeft: 8, fontSize: 11 }}>{new Date(d.decidedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions — only show for pending requests */}
      {request.status === 'pending' && (
        <div style={{ marginTop: 14 }}>
          <textarea
            placeholder="Optional comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              resize: 'vertical',
              borderRadius: 6,
              border: '1px solid var(--border, #e2e8f0)',
              padding: '6px 10px',
              fontSize: 13,
              fontFamily: 'inherit',
              marginBottom: 10,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={submitting}
              onClick={() => onDecide(request.id, 'approved', comment)}
              style={{
                padding: '7px 18px',
                borderRadius: 6,
                border: 'none',
                background: '#16a34a',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              Approve
            </button>
            <button
              disabled={submitting}
              onClick={() => onDecide(request.id, 'rejected', comment)}
              style={{
                padding: '7px 18px',
                borderRadius: 6,
                border: 'none',
                background: '#dc2626',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ApprovalInbox({ tenantSlug, userId, userRoles }: ApprovalInboxProps) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rolesParam = userRoles.join(',');
      const url = `/api/runtime/${tenantSlug}/approvals/inbox?userId=${encodeURIComponent(userId)}&roles=${encodeURIComponent(rolesParam)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load inbox (${res.status})`);
      const data = (await res.json()) as { requests: ApprovalRequest[] };
      setRequests(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, userId, userRoles]);

  useEffect(() => {
    void fetchInbox();
  }, [fetchInbox]);

  const handleDecide = useCallback(
    async (requestId: string, decision: 'approved' | 'rejected', comment: string) => {
      setSubmitting(true);
      try {
        const res = await fetch(
          `/api/runtime/${tenantSlug}/approvals/${requestId}/decide`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              approverId: userId,
              approverRoles: userRoles,
              decision,
              comment: comment || undefined,
            }),
          },
        );
        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setNotification({
          message: decision === 'approved' ? 'Approved successfully.' : 'Rejected.',
          type: decision === 'approved' ? 'success' : 'error',
        });
        setTimeout(() => setNotification(null), 3000);
        await fetchInbox();
      } catch (err) {
        setNotification({
          message: err instanceof Error ? err.message : String(err),
          type: 'error',
        });
        setTimeout(() => setNotification(null), 4000);
      } finally {
        setSubmitting(false);
      }
    },
    [tenantSlug, userId, userRoles, fetchInbox],
  );

  return (
    <div
      style={{
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        maxWidth: 700,
        margin: '0 auto',
        padding: '24px 16px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--fg, #0f172a)' }}>
          Approval Inbox
        </h2>
        <button
          onClick={() => { void fetchInbox(); }}
          disabled={loading}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--border, #e2e8f0)',
            background: 'var(--card-bg, #fff)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 13,
            color: 'var(--muted-fg, #64748b)',
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Notification toast */}
      {notification && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 600,
            fontSize: 14,
            background: notification.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: notification.type === 'success' ? '#16a34a' : '#dc2626',
            border: `1px solid ${notification.type === 'success' ? '#86efac' : '#fca5a5'}`,
          }}
        >
          {notification.message}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-fg, #64748b)' }}>
          Loading approvals…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: '#fee2e2',
            color: '#dc2626',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && requests.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--muted-fg, #94a3b8)',
            border: '1px dashed var(--border, #e2e8f0)',
            borderRadius: 10,
          }}
        >
          <div style={{ width: 48, height: 48, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', borderRadius: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No pending approvals</div>
          <div style={{ fontSize: 13 }}>You&apos;re all caught up!</div>
        </div>
      )}

      {/* Request list */}
      {!loading && !error && requests.length > 0 && (
        <div>
          {requests.map((req) => (
            <ApprovalCard
              key={req.id}
              request={req}
              onDecide={handleDecide}
              submitting={submitting}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ApprovalInbox;
