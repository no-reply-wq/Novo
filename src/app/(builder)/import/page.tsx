'use client';

import { useRef, useState } from 'react';
import type { AppBundle, ImportResult } from '@/platform/packaging/types';

const S = {
  container: { maxWidth: 800, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
  subtitle: { color: '#6b7280', marginBottom: 24, marginTop: 0 },
  dropzone: (dragging: boolean) => ({
    border: `2px dashed ${dragging ? '#2563eb' : '#d1d5db'}`,
    borderRadius: 8, padding: '32px 24px', textAlign: 'center' as const,
    background: dragging ? '#eff6ff' : '#f9fafb', cursor: 'pointer', marginBottom: 16,
    transition: 'all 0.2s',
  }),
  section: { marginBottom: 20 },
  label: { display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#374151' },
  input: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%', boxSizing: 'border-box' as const },
  textarea: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, width: '100%', height: 120, fontFamily: 'monospace', boxSizing: 'border-box' as const },
  radio: { display: 'flex', gap: 16, flexWrap: 'wrap' as const },
  radioItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 },
  btn: { padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600 },
  btnPrimary: { background: '#2563eb', color: '#fff' },
  warning: { background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', fontSize: 14, marginBottom: 16 },
  preview: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', marginBottom: 16 },
  stat: { display: 'inline-flex', flexDirection: 'column' as const, alignItems: 'center', padding: '12px 20px', background: '#eff6ff', borderRadius: 8, minWidth: 80 },
  statsRow: { display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginTop: 16 },
  error: { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', fontSize: 14, color: '#7f1d1d' },
};

function parseBundlePreview(raw: string): { bundle: AppBundle; warnings: string[] } | { error: string } {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj.bundleVersion !== 1) return { error: 'Not a valid AppBundle (bundleVersion must be 1)' };
    const bundle = obj as unknown as AppBundle;
    const warnings: string[] = [];
    const hasSecrets = bundle.integrations?.restConnectors?.some(c => c._secretsExcluded);
    if (hasSecrets) warnings.push('REST connector secrets were excluded from this bundle — re-enter API keys after import.');
    return { bundle, warnings };
  } catch {
    return { error: 'Invalid JSON' };
  }
}

export default function ImportPage() {
  const [rawJson, setRawJson] = useState('');
  const [bundle, setBundle] = useState<AppBundle | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parseError, setParseError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newAppSlug, setNewAppSlug] = useState('');
  const [mergeMode, setMergeMode] = useState<'replace' | 'merge' | 'skip'>('merge');
  const [skipExistingTables, setSkipExistingTables] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tenant = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tenant') ?? '' : '';

  function handleJson(text: string) {
    setRawJson(text);
    setResult(null);
    setImportError('');
    if (!text.trim()) { setBundle(null); setParseError(''); setParseWarnings([]); return; }
    const parsed = parseBundlePreview(text);
    if ('error' in parsed) { setParseError(parsed.error); setBundle(null); setParseWarnings([]); }
    else { setBundle(parsed.bundle); setParseError(''); setParseWarnings(parsed.warnings); setNewAppName(parsed.bundle.appName); setNewAppSlug(parsed.bundle.appSlug); }
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => handleJson(e.target?.result as string ?? '');
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function doImport() {
    if (!bundle) return;
    setImporting(true);
    setImportError('');
    setResult(null);
    const res = await fetch('/api/builder/apps/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant, bundle, newAppName: newAppName || undefined, newAppSlug: newAppSlug || undefined, mergeMode, skipExistingTables }),
    });
    setImporting(false);
    if (res.ok) {
      const data = await res.json() as ImportResult;
      setResult(data);
    } else {
      const data = await res.json() as { error?: string };
      setImportError(data.error ?? 'Import failed');
    }
  }

  return (
    <div style={S.container}>
      <h1 style={S.title}>Import App Bundle</h1>
      <p style={S.subtitle}>Drag and drop a bundle JSON file or paste the JSON below.</p>

      <div
        style={S.dropzone(dragging)}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
        <div style={{ color: '#374151', fontWeight: 500 }}>Drop bundle.json here or click to browse</div>
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      <div style={S.section}>
        <label style={S.label}>Or paste JSON</label>
        <textarea style={S.textarea} value={rawJson} onChange={e => handleJson(e.target.value)} placeholder='{ "bundleVersion": 1, ... }' />
      </div>

      {parseError && <div style={S.error}>{parseError}</div>}

      {parseWarnings.map((w, i) => <div key={i} style={S.warning}>⚠ {w}</div>)}

      {bundle && (
        <div style={S.preview}>
          <strong>Bundle Preview:</strong> {bundle.appName} · {bundle.schema.tables.length} tables · {bundle.ui.pages.length} pages · {bundle.logic.workflows.length} workflows · {bundle.scripts.length} scripts · v{bundle.version}
        </div>
      )}

      {bundle && (
        <>
          <div style={S.section}>
            <label style={S.label}>App Name</label>
            <input style={S.input} value={newAppName} onChange={e => setNewAppName(e.target.value)} placeholder="My App" />
          </div>
          <div style={S.section}>
            <label style={S.label}>App Slug</label>
            <input style={S.input} value={newAppSlug} onChange={e => setNewAppSlug(e.target.value)} placeholder="my-app" />
          </div>
          <div style={S.section}>
            <label style={S.label}>Conflict Mode</label>
            <div style={S.radio}>
              {(['merge', 'replace', 'skip'] as const).map(m => (
                <label key={m} style={S.radioItem}>
                  <input type="radio" name="mergeMode" value={m} checked={mergeMode === m} onChange={() => setMergeMode(m)} />
                  {m === 'merge' ? 'Merge (add alongside existing)' : m === 'replace' ? 'Replace (delete & reimport)' : 'Skip (do nothing if exists)'}
                </label>
              ))}
            </div>
          </div>
          <div style={{ ...S.section, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="skipTables" checked={skipExistingTables} onChange={e => setSkipExistingTables(e.target.checked)} />
            <label htmlFor="skipTables" style={{ fontSize: 14 }}>Skip tables that already exist</label>
          </div>

          <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => void doImport()} disabled={importing}>
            {importing ? 'Importing…' : 'Import App'}
          </button>
        </>
      )}

      {importError && <div style={{ ...S.error, marginTop: 16 }}>{importError}</div>}

      {result && (
        <div style={{ ...S.preview, marginTop: 20 }}>
          <strong>Import Complete!</strong> App ID: {result.appId}
          <div style={S.statsRow}>
            {[['Tables', result.tablesCreated], ['Pages', result.pagesCreated], ['Workflows', result.workflowsCreated], ['Scripts', result.scriptsCreated]].map(([label, count]) => (
              <div key={label as string} style={S.stat}>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{count}</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
              </div>
            ))}
          </div>
          {result.warnings.length > 0 && result.warnings.map((w, i) => <div key={i} style={{ ...S.warning, marginTop: 8 }}>{w}</div>)}
        </div>
      )}
    </div>
  );
}
