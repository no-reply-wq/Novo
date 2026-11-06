'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

type VersionStatus = 'draft' | 'preview' | 'published' | 'archived';

interface AppVersion {
  id: string;
  appId: string;
  version: string;
  status: VersionStatus;
  bundle: { app: { name: string; slug: string } };
  publishedAt?: string;
  publishedBy?: string;
  rollbackFrom?: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: VersionStatus): string {
  const map: Record<VersionStatus, string> = {
    draft: '#6b7280',
    preview: '#d97706',
    published: '#16a34a',
    archived: '#9ca3af',
  };
  return map[status] ?? '#6b7280';
}

function statusBg(status: VersionStatus): string {
  const map: Record<VersionStatus, string> = {
    draft: '#f3f4f6',
    preview: '#fef3c7',
    published: '#dcfce7',
    archived: '#f9fafb',
  };
  return map[status] ?? '#f3f4f6';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getTenant(): string {
  if (typeof window === 'undefined') return '';
  const parts = window.location.pathname.split('/');
  // try to find from subdomain or query
  return new URLSearchParams(window.location.search).get('tenant') ?? 'demo';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VersionsPage(): React.ReactElement {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;
  const tenant = getTenant();

  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error' = 'success'): void {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const fetchVersions = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const res = await fetch(`/api/builder/apps/${appId}/versions?tenant=${encodeURIComponent(tenant)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { versions: AppVersion[] };
      setVersions(data.versions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, [appId, tenant]);

  useEffect(() => { void fetchVersions(); }, [fetchVersions]);

  async function createDraft(): Promise<void> {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant, versionLabel: newLabel.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Create failed');
      }
      setNewLabel('');
      showToast(`Draft "${newLabel}" created`);
      await fetchVersions();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function promoteToPreview(versionId: string): Promise<void> {
    setActionPending(versionId);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/versions/${versionId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Preview failed');
      }
      showToast('Version promoted to preview');
      await fetchVersions();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setActionPending(null);
    }
  }

  async function publishVersion(versionId: string): Promise<void> {
    setActionPending(versionId);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/versions/${versionId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Publish failed');
      }
      showToast('Version published');
      await fetchVersions();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setActionPending(null);
    }
  }

  async function rollbackVersion(versionId: string): Promise<void> {
    if (!confirm('Roll back to this version? The current live version will be archived.')) return;
    setActionPending(versionId);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/versions/${versionId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Rollback failed');
      }
      showToast('Rollback successful');
      await fetchVersions();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setActionPending(null);
    }
  }

  async function exportBundle(versionId: string, bundleName: string): Promise<void> {
    setActionPending(versionId);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bundleName}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Export error', 'error');
    } finally {
      setActionPending(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const publishedVersion = versions.find(v => v.status === 'published');

  return (
    <div style={S.page}>
      {/* Toast */}
      {toast && (
        <div style={{ ...S.toast, background: toast.type === 'error' ? '#fee2e2' : '#dcfce7', color: toast.type === 'error' ? '#b91c1c' : '#15803d' }}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div style={S.header}>
        <h1 style={S.title}>App Versions</h1>
        <p style={S.sub}>Manage Draft → Preview → Publish lifecycle</p>
      </div>

      {/* Create Draft */}
      <div style={S.createBox}>
        <h2 style={S.sectionTitle}>Create Draft Version</h2>
        <div style={S.row}>
          <input
            style={S.input}
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void createDraft()}
            placeholder="e.g. 1.2.0 or sprint-42"
            disabled={creating}
          />
          <button
            style={{ ...S.btn, ...S.btnPrimary, opacity: creating || !newLabel.trim() ? 0.6 : 1 }}
            onClick={() => void createDraft()}
            disabled={creating || !newLabel.trim()}
          >
            {creating ? 'Creating…' : 'Create Draft'}
          </button>
        </div>
      </div>

      {/* Version list */}
      {loading ? (
        <div style={S.empty}>Loading versions…</div>
      ) : error ? (
        <div style={{ ...S.empty, color: '#b91c1c' }}>{error}</div>
      ) : versions.length === 0 ? (
        <div style={S.empty}>No versions yet. Create a draft to get started.</div>
      ) : (
        <div style={S.timeline}>
          {versions.map((v, i) => {
            const isLive = v.status === 'published';
            const busy = actionPending === v.id;
            return (
              <div key={v.id} style={{ ...S.card, ...(isLive ? S.cardLive : {}) }}>
                {/* Timeline dot */}
                <div style={{ ...S.dot, background: isLive ? '#16a34a' : '#d1d5db' }}>
                  {isLive && <span style={S.dotInner} />}
                </div>
                {i < versions.length - 1 && <div style={S.line} />}

                <div style={S.cardBody}>
                  <div style={S.cardTop}>
                    <span style={S.versionLabel}>{v.version}</span>
                    <span style={{ ...S.badge, background: statusBg(v.status), color: statusColor(v.status) }}>
                      {v.status}
                    </span>
                    {isLive && <span style={S.livePill}>● LIVE</span>}
                  </div>
                  <div style={S.meta}>
                    <span>Created {formatDate(v.createdAt)}</span>
                    {v.publishedAt && <span>  ·  Published {formatDate(v.publishedAt)}</span>}
                    {v.publishedBy && <span>  ·  by {v.publishedBy}</span>}
                    {v.rollbackFrom && <span style={{ color: '#d97706' }}>  ·  rollback</span>}
                  </div>
                  <div style={S.actions}>
                    {v.status === 'draft' && (
                      <>
                        <button style={{ ...S.btn, ...S.btnSecondary }} disabled={busy} onClick={() => void promoteToPreview(v.id)}>
                          {busy ? '…' : 'Preview'}
                        </button>
                        <button style={{ ...S.btn, ...S.btnPrimary }} disabled={busy} onClick={() => void publishVersion(v.id)}>
                          {busy ? '…' : 'Publish'}
                        </button>
                      </>
                    )}
                    {v.status === 'preview' && (
                      <button style={{ ...S.btn, ...S.btnPrimary }} disabled={busy} onClick={() => void publishVersion(v.id)}>
                        {busy ? '…' : 'Go Live'}
                      </button>
                    )}
                    {(v.status === 'archived' || (v.status === 'published' && publishedVersion?.id !== v.id)) && (
                      <button style={{ ...S.btn, ...S.btnDanger }} disabled={busy} onClick={() => void rollbackVersion(v.id)}>
                        {busy ? '…' : 'Rollback'}
                      </button>
                    )}
                    {isLive && (
                      <button style={{ ...S.btn, ...S.btnDanger }} disabled={busy} onClick={() => void rollbackVersion(v.id)}>
                        {busy ? '…' : 'Rollback'}
                      </button>
                    )}
                    <button
                      style={{ ...S.btn, ...S.btnGhost }}
                      disabled={busy}
                      onClick={() => void exportBundle(v.id, `${v.bundle?.app?.slug ?? appId}_${v.version}`)}
                    >
                      Export JSON
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 760, margin: '0 auto', padding: '32px 16px', fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--fg, #111)' },
  header: { marginBottom: 32 },
  title: { fontSize: 24, fontWeight: 700, margin: '0 0 4px' },
  sub: { margin: 0, color: '#6b7280', fontSize: 14 },
  createBox: { background: 'var(--surface, #f9fafb)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 20, marginBottom: 32 },
  sectionTitle: { margin: '0 0 12px', fontSize: 15, fontWeight: 600 },
  row: { display: 'flex', gap: 10 },
  input: { flex: 1, padding: '8px 12px', border: '1px solid var(--border, #d1d5db)', borderRadius: 6, fontSize: 14, background: 'var(--bg, #fff)', color: 'inherit' },
  btn: { padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'opacity .15s' },
  btnPrimary: { background: '#2563eb', color: '#fff' },
  btnSecondary: { background: '#e0e7ff', color: '#1d4ed8' },
  btnDanger: { background: '#fee2e2', color: '#b91c1c' },
  btnGhost: { background: 'transparent', color: '#374151', border: '1px solid #d1d5db' },
  timeline: { display: 'flex', flexDirection: 'column', gap: 0 },
  card: { display: 'flex', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border, #e5e7eb)', position: 'relative' },
  cardLive: { background: 'var(--live-bg, #f0fdf4)', borderRadius: 8, padding: '16px', border: '1px solid #bbf7d0', marginBottom: 8 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  versionLabel: { fontWeight: 700, fontSize: 16 },
  badge: { padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  livePill: { background: '#16a34a', color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' },
  meta: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  dot: { width: 14, height: 14, borderRadius: '50%', marginTop: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 6, height: 6, background: '#fff', borderRadius: '50%', display: 'block' },
  line: { position: 'absolute', left: 6, top: 30, bottom: -16, width: 2, background: '#e5e7eb' },
  empty: { textAlign: 'center', color: '#9ca3af', padding: '48px 0', fontSize: 15 },
  toast: { position: 'fixed', top: 20, right: 20, padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 500, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,.12)' },
};
