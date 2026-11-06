'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { parseCsv } from '@/platform/integrations/sheets/csv-importer';
import type { ColumnMapping, ImportResult } from '@/platform/integrations/sheets/csv-importer';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'source' | 'preview' | 'map' | 'result';
type SourceMode = 'csv' | 'sheets';
type DetectedType = 'text' | 'number' | 'date' | 'boolean';

interface PreviewData {
  headers: string[];
  rows: string[][];
  detectedTypes: DetectedType[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$|^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;
const BOOL_VALUES = new Set(['true', 'false', 'yes', 'no', '1', '0']);

function detectColumnType(values: string[]): DetectedType {
  const sample = values.filter((v) => v.trim() !== '').slice(0, 10);
  if (sample.length === 0) return 'text';
  if (sample.every((v) => BOOL_VALUES.has(v.toLowerCase()))) return 'boolean';
  if (sample.every((v) => NUM_RE.test(v.trim()))) return 'number';
  if (sample.every((v) => DATE_RE.test(v.trim()))) return 'date';
  return 'text';
}

function toFieldName(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    maxWidth: 820,
    margin: '0 auto',
    padding: '32px 16px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  heading: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
  } as React.CSSProperties,
  sub: {
    fontSize: 14,
    color: 'var(--fg-muted, #6b7280)',
    marginBottom: 28,
  } as React.CSSProperties,
  stepper: {
    display: 'flex',
    gap: 0,
    marginBottom: 32,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid var(--border, #e5e7eb)',
  } as React.CSSProperties,
  stepItem: (active: boolean, done: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 16px',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: 600,
    background: active ? 'var(--accent, #6366f1)' : done ? 'var(--accent-bg, #eef2ff)' : 'var(--bg, #fff)',
    color: active ? '#fff' : done ? 'var(--accent, #6366f1)' : 'var(--fg-muted, #9ca3af)',
    borderRight: '1px solid var(--border, #e5e7eb)',
    cursor: done ? 'pointer' : 'default',
  }),
  card: {
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 10,
    padding: '24px',
    marginBottom: 20,
    background: 'var(--bg, #fff)',
  } as React.CSSProperties,
  modeRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
  } as React.CSSProperties,
  modeBtn: (active: boolean): React.CSSProperties => ({
    padding: '8px 18px',
    border: active ? '2px solid var(--accent, #6366f1)' : '2px solid var(--border, #d1d5db)',
    borderRadius: 7,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    background: active ? 'var(--accent-bg, #eef2ff)' : 'transparent',
    color: active ? 'var(--accent, #6366f1)' : 'var(--fg-muted, #6b7280)',
  }),
  dropzone: (dragging: boolean): React.CSSProperties => ({
    border: `2px dashed ${dragging ? 'var(--accent, #6366f1)' : 'var(--border, #d1d5db)'}`,
    borderRadius: 8,
    padding: '36px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    background: dragging ? 'var(--accent-bg, #eef2ff)' : 'transparent',
    transition: 'all 0.15s',
  }),
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 5,
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--bg-input, #fff)',
    color: 'var(--fg, #111)',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
    marginBottom: 16,
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    background: 'var(--bg-subtle, #f9fafb)',
    borderBottom: '2px solid var(--border, #e5e7eb)',
    fontWeight: 600,
    color: 'var(--fg, #111)',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  td: {
    padding: '7px 12px',
    borderBottom: '1px solid var(--border, #f3f4f6)',
    color: 'var(--fg, #111)',
    maxWidth: 180,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  typeBadge: (t: DetectedType): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    background:
      t === 'number' ? '#dbeafe' : t === 'date' ? '#d1fae5' : t === 'boolean' ? '#fef3c7' : '#f3f4f6',
    color:
      t === 'number' ? '#1e40af' : t === 'date' ? '#065f46' : t === 'boolean' ? '#92400e' : '#6b7280',
  }),
  select: {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 6,
    fontSize: 13,
    background: 'var(--bg-input, #fff)',
    color: 'var(--fg, #111)',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: 12,
    marginTop: 24,
  } as React.CSSProperties,
  primaryBtn: (disabled: boolean): React.CSSProperties => ({
    padding: '10px 24px',
    background: disabled ? 'var(--fg-disabled, #9ca3af)' : 'var(--accent, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  secondaryBtn: {
    padding: '10px 24px',
    background: 'transparent',
    color: 'var(--fg-muted, #6b7280)',
    border: '1.5px solid var(--border, #d1d5db)',
    borderRadius: 7,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  } as React.CSSProperties,
  statusBox: (kind: 'success' | 'error'): React.CSSProperties => ({
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 16,
    background: kind === 'success' ? '#ecfdf5' : '#fef2f2',
    color: kind === 'success' ? '#065f46' : '#991b1b',
    border: `1px solid ${kind === 'success' ? '#6ee7b7' : '#fca5a5'}`,
  }),
  progressBar: (pct: number): React.CSSProperties => ({
    height: 8,
    borderRadius: 4,
    background: `linear-gradient(to right, var(--accent, #6366f1) ${pct}%, var(--border, #e5e7eb) ${pct}%)`,
    marginBottom: 12,
  }),
  resultStat: {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap' as const,
    marginBottom: 20,
  } as React.CSSProperties,
  statItem: (color: string): React.CSSProperties => ({
    padding: '12px 20px',
    borderRadius: 8,
    background: 'var(--bg-subtle, #f9fafb)',
    border: `1px solid ${color}`,
    textAlign: 'center' as const,
    minWidth: 100,
  }),
  statNum: (color: string): React.CSSProperties => ({
    fontSize: 28,
    fontWeight: 800,
    color,
    display: 'block',
    lineHeight: 1.2,
  }),
  statLabel: {
    fontSize: 12,
    color: 'var(--fg-muted, #6b7280)',
  } as React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

const STEPS: Step[] = ['source', 'preview', 'map', 'result'];
const STEP_LABELS: Record<Step, string> = {
  source: '1. Source',
  preview: '2. Preview',
  map: '3. Map columns',
  result: '4. Import',
};

export default function ImportWizardPage() {
  const params = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const appId = params.appId;
  const tenantSlug = searchParams.get('tenant') ?? '';

  const [step, setStep] = useState<Step>('source');
  const [mode, setMode] = useState<SourceMode>('csv');

  // Source inputs
  const [csvText, setCsvText] = useState('');
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [sheetsApiKey, setSheetsApiKey] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview data
  const [preview, setPreview] = useState<PreviewData | null>(null);

  // Mapping
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [targetTableId, setTargetTableId] = useState('');

  // Result
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goTo = (s: Step) => {
    const idx = STEPS.indexOf(s);
    const cur = STEPS.indexOf(step);
    if (idx < cur) setStep(s);
  };

  // ── Step 1: Source ────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    file.text().then((text) => {
      setCsvText(text);
      setError(null);
    }).catch(() => {
      setError('Failed to read the file.');
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleNext_Source = useCallback(() => {
    setError(null);
    if (mode === 'csv') {
      if (!csvText.trim()) {
        setError('No CSV content. Upload a file or paste data.');
        return;
      }
      const rows = parseCsv(csvText);
      const headers = rows[0] ?? [];
      const dataRows = rows.slice(1, 6); // first 5 for preview
      const detectedTypes: DetectedType[] = headers.map((_, colIdx) => {
        const colValues = dataRows.map((r) => r[colIdx] ?? '');
        return detectColumnType(colValues);
      });
      setPreview({ headers, rows: dataRows, detectedTypes });
      setMappings(
        headers.map((h, i) => ({
          sheetColumn: String.fromCharCode(65 + i), // A, B, C...
          fieldName: toFieldName(h),
          fieldType: detectedTypes[i],
        }))
      );
      setStep('preview');
    } else {
      if (!sheetsUrl.trim()) {
        setError('Paste a Google Sheets URL.');
        return;
      }
      setStep('preview');
    }
  }, [mode, csvText, sheetsUrl]);

  // ── Step 3: Mapping ───────────────────────────────────────────────────────

  const updateMapping = useCallback((idx: number, key: keyof ColumnMapping, value: string) => {
    setMappings((prev) => prev.map((m, i) => i === idx ? { ...m, [key]: value } : m));
  }, []);

  // ── Step 4: Import ────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!targetTableId.trim()) {
      setError('Enter the target table ID.');
      return;
    }
    setImporting(true);
    setError(null);

    try {
      const form = new FormData();
      form.append('targetTableId', targetTableId);
      form.append('columnMappings', JSON.stringify(mappings));

      if (mode === 'csv') {
        form.append('file', new Blob([csvText], { type: 'text/csv' }), 'import.csv');
      } else {
        form.append('sheetsUrl', sheetsUrl);
        form.append('apiKey', sheetsApiKey);
      }

      const res = await fetch(`/api/builder/apps/${appId}/import?tenant=${tenantSlug}`, {
        method: 'POST',
        body: form,
      });

      const data = await res.json() as ImportResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Import failed.');
      } else {
        setImportResult(data);
        setStep('result');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setImporting(false);
    }
  }, [appId, tenantSlug, mode, csvText, sheetsUrl, sheetsApiKey, mappings, targetTableId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Import data</h1>
      <p style={S.sub}>Import a CSV file or a Google Sheet into a Novo table.</p>

      {/* Stepper */}
      <div style={S.stepper}>
        {STEPS.map((s) => {
          const idx = STEPS.indexOf(s);
          const cur = STEPS.indexOf(step);
          return (
            <div
              key={s}
              style={S.stepItem(s === step, idx < cur)}
              onClick={() => goTo(s)}
            >
              {STEP_LABELS[s]}
            </div>
          );
        })}
      </div>

      {error && <div style={S.statusBox('error')}>{error}</div>}

      {/* ── Step 1: Source ────────────────────────────────────────────────── */}
      {step === 'source' && (
        <div style={S.card}>
          <div style={S.modeRow}>
            <button style={S.modeBtn(mode === 'csv')} onClick={() => setMode('csv')}>
              Upload CSV
            </button>
            <button style={S.modeBtn(mode === 'sheets')} onClick={() => setMode('sheets')}>
              Google Sheets URL
            </button>
          </div>

          {mode === 'csv' ? (
            <>
              <div
                style={S.dropzone(dragging)}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop a CSV file here</div>
                <div style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>or click to browse</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
              {csvText && (
                <div style={{ fontSize: 13, color: '#065f46', marginTop: 10 }}>
                  File loaded — {parseCsv(csvText).length} rows detected
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Google Sheets URL</label>
                <input
                  style={S.input}
                  value={sheetsUrl}
                  onChange={(e) => setSheetsUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                />
              </div>
              <div>
                <label style={S.label}>Google API Key</label>
                <input
                  style={S.input}
                  type="password"
                  value={sheetsApiKey}
                  onChange={(e) => setSheetsApiKey(e.target.value)}
                  placeholder="AIza…"
                />
                <div style={{ fontSize: 12, color: 'var(--fg-muted, #6b7280)', marginTop: 4 }}>
                  Required for public sheets. Create one in Google Cloud Console → APIs → Sheets API.
                </div>
              </div>
            </>
          )}

          <div style={S.actions}>
            <button style={S.primaryBtn(false)} onClick={handleNext_Source}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Preview ───────────────────────────────────────────────── */}
      {step === 'preview' && preview && (
        <div style={S.card}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>
            Preview — first {preview.rows.length} rows
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} style={S.th}>
                      {h}
                      <div style={{ marginTop: 4 }}>
                        <span style={S.typeBadge(preview.detectedTypes[i])}>
                          {preview.detectedTypes[i]}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri}>
                    {preview.headers.map((_, ci) => (
                      <td key={ci} style={S.td}>{row[ci] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={S.actions}>
            <button style={S.primaryBtn(false)} onClick={() => setStep('map')}>
              Continue →
            </button>
            <button style={S.secondaryBtn} onClick={() => setStep('source')}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Map columns ───────────────────────────────────────────── */}
      {step === 'map' && (
        <div style={S.card}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>
            Map columns to table fields
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={S.label}>Target table ID *</label>
            <input
              style={S.input}
              value={targetTableId}
              onChange={(e) => setTargetTableId(e.target.value)}
              placeholder="UUID of the destination table"
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Sheet column</th>
                  <th style={S.th}>Field name</th>
                  <th style={S.th}>Type</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, i) => (
                  <tr key={i}>
                    <td style={S.td}>{m.sheetColumn}</td>
                    <td style={S.td}>
                      <input
                        style={S.input}
                        value={m.fieldName}
                        onChange={(e) => updateMapping(i, 'fieldName', e.target.value)}
                      />
                    </td>
                    <td style={S.td}>
                      <select
                        style={S.select}
                        value={m.fieldType ?? 'text'}
                        onChange={(e) => updateMapping(i, 'fieldType', e.target.value as ColumnMapping['fieldType'])}
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="boolean">Boolean</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={S.actions}>
            <button style={S.primaryBtn(importing)} onClick={handleImport} disabled={importing}>
              {importing ? 'Importing…' : 'Start import'}
            </button>
            <button style={S.secondaryBtn} onClick={() => setStep('preview')}>
              ← Back
            </button>
          </div>

          {importing && (
            <div style={{ marginTop: 16 }}>
              <div style={S.progressBar(50)} />
              <div style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>Importing rows…</div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Result ────────────────────────────────────────────────── */}
      {step === 'result' && importResult && (
        <div style={S.card}>
          <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>
            Import complete
          </div>
          <div style={S.resultStat}>
            <div style={S.statItem('#6ee7b7')}>
              <span style={S.statNum('#065f46')}>{importResult.imported}</span>
              <span style={S.statLabel}>Imported</span>
            </div>
            <div style={S.statItem('#fca5a5')}>
              <span style={S.statNum('#991b1b')}>{importResult.skipped}</span>
              <span style={S.statLabel}>Skipped</span>
            </div>
            <div style={S.statItem('#e5e7eb')}>
              <span style={S.statNum('#374151')}>{importResult.totalRows}</span>
              <span style={S.statLabel}>Total rows</span>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                Errors ({importResult.errors.length})
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 13 }}>
                {importResult.errors.map((e, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border, #f3f4f6)' }}>
                    <span style={{ color: 'var(--fg-muted, #6b7280)' }}>Row {e.row}:</span>{' '}
                    {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={S.actions}>
            <button style={S.primaryBtn(false)} onClick={() => {
              setStep('source');
              setCsvText('');
              setSheetsUrl('');
              setImportResult(null);
              setPreview(null);
              setMappings([]);
              setTargetTableId('');
            }}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
