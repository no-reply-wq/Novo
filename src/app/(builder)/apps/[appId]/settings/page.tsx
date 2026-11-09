'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Save, Package, Info } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppDetails {
  id: string;
  name: string;
  tenantSlug: string;
  description?: string;
}

interface AppVersion {
  id: string;
  label: string;
  createdBy: string | null;
  createdAt: string;
}

type ActiveTab = 'general' | 'packages';

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    color: active ? '#009A8A' : 'var(--fg-muted, #6b7280)',
    borderBottom: active ? '2px solid #009A8A' : '2px solid transparent',
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
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--fg-muted, #6b7280)',
    marginBottom: 4,
  } as React.CSSProperties,
  fieldGroup: {
    marginBottom: 16,
  } as React.CSSProperties,
  input: {
    padding: '8px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 14,
    width: '100%',
    maxWidth: 480,
    color: 'var(--fg, #111)',
    background: 'var(--surface, #fff)',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  inputReadonly: {
    padding: '8px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 14,
    width: '100%',
    maxWidth: 480,
    color: 'var(--fg-muted, #6b7280)',
    background: 'var(--bg-muted, #f9fafb)',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  textarea: {
    padding: '8px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 14,
    width: '100%',
    maxWidth: 480,
    color: 'var(--fg, #111)',
    background: 'var(--surface, #fff)',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    minHeight: 80,
  } as React.CSSProperties,
  portalPreview: {
    display: 'inline-block',
    padding: '6px 10px',
    background: 'var(--bg-muted, #f9fafb)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 12,
    fontFamily: 'monospace',
    color: 'var(--fg-muted, #6b7280)',
    maxWidth: 480,
    wordBreak: 'break-all' as const,
  } as React.CSSProperties,
  row: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    marginBottom: 12,
  } as React.CSSProperties,
  btn: (variant: 'primary' | 'secondary' | 'danger' = 'secondary', disabled = false): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 6,
    border: variant === 'primary' ? 'none' : '1px solid var(--border, #e5e7eb)',
    background:
      disabled ? '#d1d5db'
      : variant === 'primary' ? '#009A8A'
      : variant === 'danger' ? '#fee2e2'
      : 'var(--surface, #fff)',
    color:
      disabled ? '#9ca3af'
      : variant === 'primary' ? '#fff'
      : variant === 'danger' ? '#dc2626'
      : 'var(--fg, #111)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14,
    fontWeight: 500,
  }),
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
      label === 'published' ? '#dcfce7'
      : label === 'preview' ? '#fef9c3'
      : '#f3f4f6',
    color:
      label === 'published' ? '#16a34a'
      : label === 'preview' ? '#ca8a04'
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

  const [activeTab, setActiveTab] = useState<ActiveTab>('general');
  const [tenantSlug, setTenantSlug] = useState('');

  // General / app details state
  const [app, setApp] = useState<AppDetails | null>(null);
  const [appName, setAppName] = useState('');
  const [appDescription, setAppDescription] = useState('');
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Package state
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [overwriteOnImport, setOverwriteOnImport] = useState(false);
  const [importAppName, setImportAppName] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve tenant + load app details
  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then((s: { user?: { tenantSlug?: string } }) => {
        if (s?.user?.tenantSlug) setTenantSlug(s.user.tenantSlug);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(`/api/builder/apps/${appId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: AppDetails | null) => {
        if (data) {
          setApp(data);
          setAppName(data.name);
          setAppDescription(data.description ?? '');
        }
      })
      .catch(() => undefined);
  }, [appId]);

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

  // ── Save general ──

  async function handleSaveGeneral() {
    if (!appName.trim()) return;
    setSavingGeneral(true);
    setStatus(null);
    try {
      const r = await fetch(`/api/builder/apps/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: appName.trim(), description: appDescription }),
      });
      const data = (await r.json()) as AppDetails & { error?: string };
      if (!r.ok) throw new Error(data.error ?? 'Save failed');
      setApp(data);
      setStatus({ type: 'success', message: 'App details saved.' });
    } catch (e) {
      setStatus({ type: 'error', message: String(e) });
    } finally {
      setSavingGeneral(false);
    }
  }

  // ── Export ──

  async function handleExport() {
    setStatus(null);
    try {
      const r = await fetch(`/api/builder/apps/${appId}/packages?tenant=${tenantSlug}`);
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition') ?? '';
      const nameMatch = cd.match(/filename="([^"]+)"/);
      const filename = nameMatch ? nameMatch[1] : 'app_export.json';
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
          newAppName: importAppName.trim() || undefined,
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

  // ── Render portal URL preview ──

  const portalUrl = app
    ? `http://localhost:3000/portal/${app.tenantSlug}/${appId}`
    : '';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={S.container}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>App Settings</h1>
      <p style={{ color: 'var(--fg-muted, #6b7280)', marginBottom: 24, fontSize: 14 }}>
        Manage app details, packages, and version history.
      </p>

      {/* Tabs */}
      <div style={S.tabs}>
        {([
          { key: 'general', label: 'General', icon: <Info className="w-3.5 h-3.5" /> },
          { key: 'packages', label: 'Packages', icon: <Package className="w-3.5 h-3.5" /> },
        ] as { key: ActiveTab; label: string; icon: React.ReactNode }[]).map(tab => (
          <button
            key={tab.key}
            style={S.tab(activeTab === tab.key)}
            onClick={() => setActiveTab(tab.key)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {tab.icon}
              {tab.label}
            </span>
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
            <div style={S.sectionTitle}>App Details</div>

            <div style={S.fieldGroup}>
              <label style={S.label} htmlFor="app-name">App Name</label>
              <input
                id="app-name"
                style={S.input}
                value={appName}
                onChange={e => setAppName(e.target.value)}
                placeholder="My App"
              />
            </div>

            <div style={S.fieldGroup}>
              <label style={S.label} htmlFor="app-id-display">App ID (read-only)</label>
              <input
                id="app-id-display"
                style={S.inputReadonly}
                value={appId}
                readOnly
              />
            </div>

            <div style={S.fieldGroup}>
              <label style={S.label} htmlFor="app-description">Description</label>
              <textarea
                id="app-description"
                style={S.textarea}
                value={appDescription}
                onChange={e => setAppDescription(e.target.value)}
                placeholder="A short description of this app…"
              />
            </div>

            <div style={S.fieldGroup}>
              <label style={S.label}>Portal URL</label>
              <div style={S.portalPreview}>
                {portalUrl || 'Loading…'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted, #6b7280)', marginTop: 4 }}>
                Share this URL with portal users to give them access.
              </div>
            </div>

            <button
              style={S.btn('primary', savingGeneral || !appName.trim())}
              onClick={() => void handleSaveGeneral()}
              disabled={savingGeneral || !appName.trim()}
            >
              <Save className="w-4 h-4" />
              {savingGeneral ? 'Saving…' : 'Save Changes'}
            </button>
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
              Export as JSON
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
                style={{ ...S.input, maxWidth: 320 }}
                placeholder="New app name (optional)"
                value={importAppName}
                onChange={e => setImportAppName(e.target.value)}
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
              style={S.btn('primary', !importFile)}
              onClick={() => void handleImport()}
              disabled={!importFile}
            >
              Import Package
            </button>
          </div>

          {/* Version history */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Version History</div>
            <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginBottom: 12 }}>
              Save a snapshot of the current app state. Labels: <code>draft</code>, <code>preview</code>, <code>published</code>, or any custom label.
            </p>

            <div style={S.row}>
              <input
                style={{ ...S.input, maxWidth: 240 }}
                placeholder="Version label (e.g. published)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newLabel.trim()) void handleCreateVersion(newLabel.trim()); }}
              />
              <button
                style={S.btn('secondary', !newLabel.trim())}
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
                    Rollback
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
