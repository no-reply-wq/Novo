'use client';

import React, { useState, useRef, useCallback } from 'react';
import type { AppBundle, ImportResult } from '@/platform/packaging/types';

type MergeMode = 'replace' | 'merge' | 'skip';

interface ParsedPreview {
  bundle: AppBundle;
  tableCount: number;
  pageCount: number;
  workflowCount: number;
  scriptCount: number;
  integrationCount: number;
  hasSecrets: boolean;
}

function parseBundlePreview(raw: unknown): ParsedPreview | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<AppBundle>;
  if (!b.app || !b.schema) return null;
  return {
    bundle: b as AppBundle,
    tableCount: b.schema?.tables?.length ?? 0,
    pageCount: b.ui?.pages?.length ?? 0,
    workflowCount: b.logic?.workflows?.length ?? 0,
    scriptCount: b.scripts?.length ?? 0,
    integrationCount:
      (b.integrations?.pdfTemplates?.length ?? 0) +
      (b.integrations?.emailTemplates?.length ?? 0),
    hasSecrets: (b.integrations?.restConnectors ?? []).some(
      (c: unknown) => (c as { _secretsExcluded?: boolean })._secretsExcluded,
    ),
  };
}

function getTenant(): string {
  if (typeof window === 'undefined') return 'demo';
  return new URLSearchParams(window.location.search).get('tenant') ?? 'demo';
}

export default function ImportPage(): React.ReactElement {
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newAppSlug, setNewAppSlug] = useState('');
  const [mergeMode, setMergeMode] = useState<MergeMode>('replace');
  const [skipExisting, setSkipExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawJson, setRawJson] = useState('');

  function handleFile(file: File): void {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result;
      if (typeof text !== 'string') return;
      setRawJson(text);
      try {
        const parsed = JSON.parse(text) as unknown;
        const p = parseBundlePreview(parsed);
        if (!p) {
          setParseError('Invalid bundle — missing required fields (app, schema)');
          setPreview(null);
        } else {
          setParseError(null);
          setPreview(p);
          setNewAppName(p.bundle.app.name);
          setNewAppSlug(p.bundle.app.slug);
        }
      } catch {
        setParseError('Could not parse JSON');
        setPreview(null);
      }
    };
    reader.readAsText(file);
  }

  function handlePaste(text: string): void {
    setRawJson(text);
    try {
      const parsed = JSON.parse(text) as unknown;
      const p = parseBundlePreview(parsed);
      if (!p) {
        setParseError('Invalid bundle');
        setPreview(null);
      } else {
        setParseError(null);
        setPreview(p);
        setNewAppName(p.bundle.app.name);
        setNewAppSlug(p.bundle.app.slug);
      }
    } catch {
      setParseError('Invalid JSON');
      setPreview(null);
    }
  }

  const onDrop = useCallback((e: React.DragEvent): void => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  async function doImport(): Promise<void> {
    if (!preview) return;
    setImporting(true);
    setImportError(null);
    setResult(null);
    try {
      const res = await fetch('/api/builder/apps/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant: getTenant(),
          bundle: preview.bundle,
          newAppName: newAppName.trim() || undefined,
          newAppSlug: newAppSlug.trim() || undefined,
          mergeMode,
          skipExistingTables: skipExisting,
        }),
      });
      const data = await res.json() as ImportResult & { error?: string };
      if (!res.ok) {
        setImportError(data.error ?? 'Import failed');
        return;
      }
      setResult(data);
    } catch {
      setImportError('Network error');
    } finally {
      setImporting(false);
    }
  }

  function reset(): void {
    setPreview(null);
    setRawJson('');
    setParseError(null);
    setResult(null);
    setImportError(null);
    setNewAppName('');
    setNewAppSlug('');
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div style={S.page}>
        <div style={S.successBox}>
          <div style={S.successIcon}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h2 style={S.successTitle}>Import complete</h2>
          <div style={S.statRow}>
            <Stat label="Tables" value={result.tablesCreated} />
            <Stat label="Pages" value={result.pagesCreated} />
            <Stat label="Workflows" value={result.workflowsCreated} />
            <Stat label="Scripts" value={result.scriptsCreated} />
          </div>
          {result.warnings.length > 0 && (
            <div style={S.warnings}>
              <strong>Warnings:</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          <div style={S.statRow}>
            <span style={{ color: '#6b7280', fontSize: 12 }}>App ID: {result.appId}</span>
          </div>
          <button style={{ ...S.btn, ...S.btnPrimary, marginTop: 20 }} onClick={reset}>
            Import another app
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>Import App Bundle</h1>
        <p style={S.sub}>Drop a JSON bundle file, paste JSON, or fill in the details below.</p>
      </div>

      {/* Drop zone */}
      <div
        style={{ ...S.dropzone, ...(dragging ? S.dropzoneDrag : {}) }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <div style={S.dropIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
            <path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
          </svg>
        </div>
        <div style={S.dropText}>Drop bundle JSON here or click to browse</div>
        <div style={S.dropSub}>Accepts .json files exported from Novo</div>
      </div>

      {/* Paste area */}
      <div style={S.section}>
        <label style={S.label}>Or paste JSON bundle</label>
        <textarea
          style={S.textarea}
          rows={6}
          value={rawJson}
          placeholder='{"version":"1.0.0","app":{"name":"..."},...}'
          onChange={e => handlePaste(e.target.value)}
        />
      </div>

      {parseError && <div style={S.errorBox}>{parseError}</div>}

      {/* Bundle preview */}
      {preview && (
        <div style={S.previewBox}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Bundle preview</h3>
          <div style={S.previewGrid}>
            <PreviewItem label="App" value={preview.bundle.app.name} />
            <PreviewItem label="Version" value={preview.bundle.version} />
            <PreviewItem label="Tables" value={String(preview.tableCount)} />
            <PreviewItem label="Pages" value={String(preview.pageCount)} />
            <PreviewItem label="Workflows" value={String(preview.workflowCount)} />
            <PreviewItem label="Scripts" value={String(preview.scriptCount)} />
            <PreviewItem label="Integrations" value={String(preview.integrationCount)} />
            <PreviewItem label="Exported" value={preview.bundle.exportedAt ? new Date(preview.bundle.exportedAt).toLocaleDateString() : '—'} />
          </div>
          {preview.hasSecrets && (
            <div style={S.warningBanner}>
              Warning: This bundle contains REST connectors. Secret credentials were excluded — you will need to re-enter them after import.
            </div>
          )}
        </div>
      )}

      {/* Import options */}
      {preview && (
        <div style={S.section}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Import options</h3>
          <div style={S.formGrid}>
            <div style={S.field}>
              <label style={S.label}>App name</label>
              <input
                style={S.input}
                value={newAppName}
                onChange={e => setNewAppName(e.target.value)}
                placeholder={preview.bundle.app.name}
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>App slug</label>
              <input
                style={S.input}
                value={newAppSlug}
                onChange={e => setNewAppSlug(e.target.value)}
                placeholder={preview.bundle.app.slug}
              />
            </div>
          </div>
          <div style={{ ...S.field, marginTop: 12 }}>
            <label style={S.label}>If app already exists</label>
            <div style={S.radioGroup}>
              {(['replace', 'merge', 'skip'] as MergeMode[]).map(m => (
                <label key={m} style={S.radio}>
                  <input type="radio" name="mergeMode" value={m} checked={mergeMode === m} onChange={() => setMergeMode(m)} />
                  <span>
                    <strong>{m.charAt(0).toUpperCase() + m.slice(1)}</strong>
                    {m === 'replace' && ' — delete existing and re-import'}
                    {m === 'merge' && ' — add new items, keep existing'}
                    {m === 'skip' && ' — do nothing if app exists'}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label style={{ ...S.radio, marginTop: 12 }}>
            <input type="checkbox" checked={skipExisting} onChange={e => setSkipExisting(e.target.checked)} />
            <span>Skip tables that already exist</span>
          </label>
        </div>
      )}

      {importError && <div style={S.errorBox}>{importError}</div>}

      {preview && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            style={{ ...S.btn, ...S.btnPrimary, opacity: importing ? 0.6 : 1 }}
            onClick={() => void doImport()}
            disabled={importing}
          >
            {importing ? 'Importing…' : 'Import App'}
          </button>
          <button style={{ ...S.btn, ...S.btnGhost }} onClick={reset}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div style={{ textAlign: 'center', padding: '12px 16px' }}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
    </div>
  );
}

function PreviewItem({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <span style={{ color: '#6b7280', fontSize: 12 }}>{label}: </span>
      <span style={{ fontWeight: 500, fontSize: 13 }}>{value}</span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 720, margin: '0 auto', padding: '32px 16px', fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--fg, #111)' },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, margin: '0 0 4px' },
  sub: { margin: 0, color: '#6b7280', fontSize: 14 },
  dropzone: { border: '2px dashed #d1d5db', borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer', marginBottom: 24, transition: 'border-color .15s, background .15s', background: 'var(--surface, #f9fafb)' },
  dropzoneDrag: { borderColor: '#2563eb', background: '#eff6ff' },
  dropIcon: { fontSize: 36, marginBottom: 8 },
  dropText: { fontWeight: 500, fontSize: 15, marginBottom: 4 },
  dropSub: { fontSize: 13, color: '#6b7280' },
  section: { marginBottom: 24 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 },
  textarea: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', background: 'var(--bg, #fff)', color: 'inherit', boxSizing: 'border-box' },
  errorBox: { background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 },
  previewBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 20, marginBottom: 24 },
  previewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px 16px', marginBottom: 12 },
  warningBanner: { background: '#fef3c7', color: '#92400e', padding: '10px 14px', borderRadius: 6, fontSize: 13 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  field: {},
  input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, background: 'var(--bg, #fff)', color: 'inherit', boxSizing: 'border-box' },
  radioGroup: { display: 'flex', flexDirection: 'column', gap: 10 },
  radio: { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, cursor: 'pointer' },
  btn: { padding: '10px 18px', borderRadius: 7, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'opacity .15s' },
  btnPrimary: { background: '#2563eb', color: '#fff' },
  btnGhost: { background: 'transparent', color: '#374151', border: '1px solid #d1d5db' },
  successBox: { textAlign: 'center', padding: '48px 24px', background: '#f0fdf4', borderRadius: 16, border: '1px solid #bbf7d0' },
  successIcon: { fontSize: 48, color: '#16a34a', marginBottom: 12 },
  successTitle: { fontSize: 22, fontWeight: 700, margin: '0 0 20px' },
  statRow: { display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' },
  warnings: { background: '#fef3c7', color: '#92400e', padding: '12px 16px', borderRadius: 8, fontSize: 13, textAlign: 'left', margin: '16px auto', maxWidth: 480 },
};
