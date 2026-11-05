'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppVersion {
  id: string;
  label: string;
  createdBy: string | null;
  createdAt: string;
}

type ActiveTab = 'general' | 'packages';

// ─── Styles (inline, no external deps) ───────────────────────────────────────

const S = {
  container: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '32px 16px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  tabs: {
    display: 'flex',
    gap: 2,
    borderBottom: '1px solid var(--border, #e5e7eb)',
    marginBottom: 32,
  } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--accent, #6366f1)' : 'var(--fg-muted, #6b7280)',
    borderBottom: active ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
    marginBottom: -1,
    fontSize: 14,
  }),
  section: {
    marginBottom: 32,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 12,
  } as React.CSSProperties,
  row: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  } as React.CSSProperties,
  btn: (variant: 'primary' | 'secondary' | 'danger' = 'secondary'): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 6,
    border: variant === 'primary' ? 'none' : '1px solid var(--border, #e5e7eb)',
    background:
      variant === 'primary'
        ? 'var(--accent, #6366f1)'
        : variant === 'danger'
        ? '#fee2e2'
        : 'var(--surface, #fff)',
    color:
      variant === 'primary'
        ? '#fff'
        : variant === 'danger'
        ? '#dc2626'
        : 'var(--fg, #111)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  }),
  input: {
    padding: '8px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 14,
    width: 280,
    color: 'var(--fg, #111)',
    background: 'var(--surface, #fff)',
  } as React.CSSProperties,
  versionCard: {
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--surface, #fff)',
  } as React.CSSProperties,
  badge: (label: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background:
      label === 'published'
        ? '#dcfce7'
        : label === 'preview'
        ? '#fef9c3'
        : '#f3f4f6',
    color:
      label === 'published'
        ? '#16a34a'
        : label === 'preview'
        ? '#ca8a04'
        : '#374151',
  }),
  statusMsg: (type: 'success' | 'error'): React.CSSProperties => ({
    padding: '10px 14px',
    borderRadius: 6,
    background: type === 'success' ? '#dcfce7' : '#fee2e2',
    color: type === 'success' ? '#166534' : '#991b1b',
    fontSize: 13,
    marginBottom: 16,
  }),
  emptyState: {
    textAlign: 'center' as const,
    padding: '32px 0',
    color: 'var(--fg-muted, #6b7280)',
    fontSize: 14,
  } as React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppSettingsPage() {
  const params = useParams() as { appId: string };
  const { appId } = params;

  const [activeTab, setActiveTab] = useState<ActiveTab>('packages');
  const [tenantSlug, setTenantSlug] = useState('');

  // Package state
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [overwriteOnImport, setOverwriteOnImport] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve tenant from session
  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then((s: { user?: { tenantSlug?: string } }) => {
        if (s?.user?.tenantSlug) setTenantSlug(s.user.tenantSlug);
      })
      .catch(() => undefined);
  }, []);

  const loadVersions = useCallback(async () => {
    if (!tenantSlug) return;
    setVersionsLoading(true);
    try {
      const r = await fetch(`/api/builder/apps/${appId}/versions?tenant=${tenantSlug}`);
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { versions: AppVersion[] };
      setVersions(data.versions);
    } catch (e) {
      setStatus({ type: 'error', message: String(e) });
    } finally {
      setVersionsLoading(false);
    }
  }, [appId, tenantSlug]);

  useEffect(() => {
    if (tenantSlug) void loadVersions();
  }, [tenantSlug, loadVersions]);

  // ── Export ──

  async function handleExport() {
    setStatus(null);
    try {
      const r = await fetch(`/api/builder/apps/${appId}/packages?tenant=${tenantSlug}`);
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition') ?? '';
      const nameMatch = cd.match(/filename="([^"]+)"/);
      const filename = nameMatch ? nameMatch[1] : `app_export.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'success', message: 'App exported successfully.' });
    } catch (e) {
      setStatus({ type: 'error', message: `Export failed: ${String(e)}` });
    }
  }

  // ── Import ──

  async function handleImport() {
    if (!importFile) return;
    setStatus(null);
    try {
      const text = await importFile.text();
      const pkg = JSON.parse(text) as unknown;
      const r = await fetch(`/api/builder/apps/${appId}/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant: tenantSlug,
          overwrite: overwriteOnImport,
          newAppName: newAppName.trim() || undefined,
          package: pkg,
        }),
      });
      const data = (await r.json()) as { appId?: string; warnings?: string[]; error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Import failed');
      let msg = `App imported successfully (ID: ${data.appId ?? 'unknown'}).`;
      if (data.warnings && data.warnings.length > 0) {
        msg += ` Warnings: ${data.warnings.join('; ')}`;
      }
      setStatus({ type: 'success', message: msg });
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setStatus({ type: 'error', message: `Import failed: ${String(e)}` });
    }
  }

  // ── Create version ──

  async function handleCreateVersion(label: string) {
    setStatus(null);
    try {
      const r = await fetch(`/api/builder/apps/${appId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantSlug, label }),
      });
      const data = (await r.json()) as { versionId?: string; error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Create version failed');
      setStatus({ type: 'success', message: `Version "${label}" created.` });
      setNewLabel('');
      void loadVersions();
    } catch (e) {
      setStatus({ type: 'error', message: String(e) });
    }
  }

  // ── Rollback ──

  async function handleRollback(versionId: string, label: string) {
    if (!confirm(`Roll back to version "${label}"? The current app state will be saved first.`)) return;
    setStatus(null);
    try {
      const r = await fetch(`/api/builder/apps/${appId}/versions/${versionId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantSlug }),
      });
      const data = (await r.json()) as { appId?: string; warnings?: string[]; error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Rollback failed');
      setStatus({ type: 'success', message: `Rolled back to "${label}" successfully.` });
      void loadVersions();
    } catch (e) {
      setStatus({ type: 'error', message: String(e) });
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={S.container}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>App Settings</h1>
      <p style={{ color: 'var(--fg-muted, #6b7280)', marginBottom: 24, fontSize: 14 }}>
        Manage packages, version history, and app configuration.
      </p>

      {/* Tabs */}
      <div style={S.tabs}>
        {(['general', 'packages'] as ActiveTab[]).map(tab => (
          <button
            key={tab}
            style={S.tab(activeTab === tab)}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Status message */}
      {status && (
        <div style={S.statusMsg(status.type)}>
          {status.message}
          <button
            onClick={() => setStatus(null)}
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* General tab */}
      {activeTab === 'general' && (
        <div>
          <div style={S.section}>
            <div style={S.sectionTitle}>App ID</div>
            <code style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>{appId}</code>
          </div>
          <div style={S.section}>
            <div style={S.sectionTitle}>Tenant</div>
            <code style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>{tenantSlug || '—'}</code>
          </div>
        </div>
      )}

      {/* Packages tab */}
      {activeTab === 'packages' && (
        <div>

          {/* Export */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Export App</div>
            <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginBottom: 12 }}>
              Download the full app configuration (tables, pages, workflows, scripts, PDF templates) as a JSON file. No data is included.
            </p>
            <button style={S.btn('primary')} onClick={() => void handleExport()}>
              ⬇ Export as JSON
            </button>
          </div>

          {/* Import */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Import App</div>
            <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginBottom: 12 }}>
              Upload a previously exported app package JSON file.
            </p>
            <div style={S.row}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: 13 }}
              />
            </div>
            <div style={S.row}>
              <input
                style={S.input}
                placeholder="New app name (optional, leave blank to keep original)"
                value={newAppName}
                onChange={e => setNewAppName(e.target.value)}
              />
            </div>
            <div style={{ ...S.row, marginBottom: 16 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={overwriteOnImport}
                  onChange={e => setOverwriteOnImport(e.target.checked)}
                />
                Overwrite existing app with same name
              </label>
            </div>
            <button
              style={S.btn('primary')}
              onClick={() => void handleImport()}
              disabled={!importFile}
            >
              ⬆ Import Package
            </button>
          </div>

          {/* Version history */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Version History</div>
            <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginBottom: 12 }}>
              Save a snapshot of the current app state. Labels: <code>draft</code>, <code>preview</code>, <code>published</code>, or any custom label.
            </p>

            {/* Create version row */}
            <div style={S.row}>
              <input
                style={S.input}
                placeholder="Version label (e.g. published)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newLabel.trim()) void handleCreateVersion(newLabel.trim()); }}
              />
              <button
                style={S.btn('primary')}
                onClick={() => { if (newLabel.trim()) void handleCreateVersion(newLabel.trim()); }}
                disabled={!newLabel.trim()}
              >
                Save Version
              </button>
              <button
                style={S.btn('primary')}
                onClick={() => void handleCreateVersion('published')}
              >
                Publish
              </button>
            </div>

            {/* Version list */}
            {versionsLoading ? (
              <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>Loading versions…</p>
            ) : versions.length === 0 ? (
              <div style={S.emptyState}>No versions saved yet.</div>
            ) : (
              versions.map(v => (
                <div key={v.id} style={S.versionCard}>
                  <div>
                    <span style={S.badge(v.label)}>{v.label}</span>
                    <span style={{ marginLeft: 10, fontSize: 13 }}>
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                    {v.createdBy && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--fg-muted, #6b7280)' }}>
                        by {v.createdBy}
                      </span>
                    )}
                  </div>
                  <button
                    style={S.btn('secondary')}
                    onClick={() => void handleRollback(v.id, v.label)}
                  >
                    ↩ Rollback
                  </button>
                </div>
              ))
            )}
          </div>

        </div>
      )}
    </div>
  );
}
