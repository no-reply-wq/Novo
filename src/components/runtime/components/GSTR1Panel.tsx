'use client';

import React, { useState, useEffect, useCallback } from 'react';

export interface GSTR1PanelProps {
  tenantSlug: string
  appId: string
}

interface FilingSummary {
  b2bCount: number
  b2clCount: number
  b2csCount: number
  cdnrCount: number
  hsnCount: number
  invoiceCount: number
  totalTaxableValue: number
  totalTax: number
}

interface GenerateResult {
  filingId: string
  period: string
  summary: FilingSummary
}

interface FilingRecord {
  id: string
  period: string
  status: string
  invoice_count: number | null
  total_taxable_value: string | null
  total_tax: string | null
  generated_at: string | null
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  container: { fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--fg, #111)', padding: 24, maxWidth: 900, margin: '0 auto' } as React.CSSProperties,
  heading: { fontSize: 20, fontWeight: 700, marginBottom: 4 } as React.CSSProperties,
  sub: { fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginBottom: 24 } as React.CSSProperties,
  controls: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' as const } as React.CSSProperties,
  select: { padding: '8px 12px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 6, fontSize: 14, background: 'var(--bg-input, #fff)' } as React.CSSProperties,
  btn: (variant: 'primary' | 'secondary' | 'ghost', disabled?: boolean): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600,
    background: variant === 'primary' ? (disabled ? '#a5b4fc' : 'var(--accent, #6366f1)') : variant === 'secondary' ? 'var(--bg-muted, #f3f4f6)' : 'transparent',
    color: variant === 'primary' ? '#fff' : 'var(--fg, #111)',
    opacity: disabled ? 0.7 : 1,
  }),
  card: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: 20, marginBottom: 20, background: 'var(--bg-card, #fff)' } as React.CSSProperties,
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 20 } as React.CSSProperties,
  statTile: { background: 'var(--bg-muted, #f9fafb)', borderRadius: 8, padding: '16px 20px', border: '1px solid var(--border, #e5e7eb)' } as React.CSSProperties,
  statLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--fg-muted, #6b7280)', marginBottom: 6 } as React.CSSProperties,
  statValue: { fontSize: 22, fontWeight: 700 } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as React.CSSProperties,
  th: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, color: 'var(--fg-muted, #6b7280)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as React.CSSProperties,
  badge: (status: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
    background: status === 'filed' ? '#d1fae5' : '#fef3c7',
    color: status === 'filed' ? '#065f46' : '#d97706',
  }),
  error: { fontSize: 13, color: '#dc2626', marginTop: 8 } as React.CSSProperties,
  downloadRow: { display: 'flex', gap: 10, marginTop: 16 } as React.CSSProperties,
};

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDefaultPeriod(): { month: number; year: number } {
  const now = new Date();
  let month = now.getMonth(); // 0-indexed, so this is last month
  let year = now.getFullYear();
  if (month === 0) { month = 12; year -= 1; } // December of last year
  return { month, year };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GSTR1Panel({ tenantSlug, appId }: GSTR1PanelProps): React.ReactElement {
  const defaultPeriod = getDefaultPeriod();
  const [month, setMonth] = useState(defaultPeriod.month);
  const [year, setYear] = useState(defaultPeriod.year);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const [history, setHistory] = useState<FilingRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/runtime/gstr1/history?tenant=${encodeURIComponent(tenantSlug)}&appId=${encodeURIComponent(appId)}`
      );
      if (res.ok) {
        const data = await res.json() as { filings: FilingRecord[] };
        setHistory(data.filings ?? []);
      }
    } catch {
      // ignore — history is optional
    } finally {
      setLoadingHistory(false);
    }
  }, [tenantSlug, appId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setResult(null);
    try {
      const res = await fetch('/api/runtime/gstr1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, appId, month, year }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setGenerateError(err.error ?? 'Generation failed');
        return;
      }
      const data = await res.json() as GenerateResult;
      setResult(data);
      void loadHistory();
    } catch {
      setGenerateError('Network error — please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (filingId: string, format: 'json' | 'csv') => {
    const url = `/api/runtime/gstr1/download/${filingId}?tenant=${encodeURIComponent(tenantSlug)}&format=${format}`;
    const a = document.createElement('a');
    a.href = url;
    a.click();
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => currentYear - 7 + i);

  return (
    <div style={S.container}>
      <h2 style={S.heading}>GST R1 Filing</h2>
      <p style={S.sub}>Generate monthly GST R1 return for outward supplies.</p>

      {/* ── Period Picker + Generate ────────────────────────────────────── */}
      <div style={S.controls}>
        <select style={S.select} value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select style={S.select} value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          style={S.btn('primary', generating)}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? 'Generating…' : 'Generate R1'}
        </button>
      </div>

      {generateError && <p style={S.error}>{generateError}</p>}

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      {result && (
        <div style={S.card}>
          <p style={{ fontWeight: 600, marginBottom: 16 }}>
            R1 for {MONTHS[month - 1]} {year} — {result.summary.invoiceCount} invoices
          </p>
          <div style={S.summaryGrid}>
            <div style={S.statTile}>
              <div style={S.statLabel}>B2B Parties</div>
              <div style={S.statValue}>{result.summary.b2bCount}</div>
            </div>
            <div style={S.statTile}>
              <div style={S.statLabel}>B2CL (Large)</div>
              <div style={S.statValue}>{result.summary.b2clCount}</div>
            </div>
            <div style={S.statTile}>
              <div style={S.statLabel}>B2CS Groups</div>
              <div style={S.statValue}>{result.summary.b2csCount}</div>
            </div>
            <div style={S.statTile}>
              <div style={S.statLabel}>HSN Lines</div>
              <div style={S.statValue}>{result.summary.hsnCount}</div>
            </div>
            <div style={S.statTile}>
              <div style={S.statLabel}>Taxable Value</div>
              <div style={{ ...S.statValue, fontSize: 16 }}>{formatINR(result.summary.totalTaxableValue)}</div>
            </div>
            <div style={S.statTile}>
              <div style={S.statLabel}>Total Tax</div>
              <div style={{ ...S.statValue, fontSize: 16 }}>{formatINR(result.summary.totalTax)}</div>
            </div>
          </div>
          <div style={S.downloadRow}>
            <button style={S.btn('secondary')} onClick={() => handleDownload(result.filingId, 'json')}>
              ⬇ Download JSON
            </button>
            <button style={S.btn('secondary')} onClick={() => handleDownload(result.filingId, 'csv')}>
              ⬇ Download CSV Summary
            </button>
          </div>
        </div>
      )}

      {/* ── Filing History ───────────────────────────────────────────────── */}
      <div style={S.card}>
        <p style={{ fontWeight: 600, marginBottom: 16 }}>Filing History</p>
        {loadingHistory ? (
          <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>Loading…</p>
        ) : history.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>No filings yet. Generate your first R1 above.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Period</th>
                <th style={S.th}>Invoices</th>
                <th style={S.th}>Taxable Value</th>
                <th style={S.th}>Total Tax</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Generated</th>
                <th style={S.th}>Download</th>
              </tr>
            </thead>
            <tbody>
              {history.map((f) => {
                const periodMonth = MONTHS[parseInt(f.period.substring(0, 2), 10) - 1] ?? f.period.substring(0, 2);
                const periodYear = f.period.substring(2);
                return (
                  <tr key={f.id}>
                    <td style={S.td}>{periodMonth} {periodYear}</td>
                    <td style={S.td}>{f.invoice_count ?? '—'}</td>
                    <td style={S.td}>{f.total_taxable_value ? formatINR(parseFloat(f.total_taxable_value)) : '—'}</td>
                    <td style={S.td}>{f.total_tax ? formatINR(parseFloat(f.total_tax)) : '—'}</td>
                    <td style={S.td}><span style={S.badge(f.status)}>{f.status}</span></td>
                    <td style={S.td}>{f.generated_at ? new Date(f.generated_at).toLocaleDateString('en-IN') : '—'}</td>
                    <td style={S.td}>
                      <button style={{ ...S.btn('ghost'), padding: '4px 10px', fontSize: 12 }} onClick={() => handleDownload(f.id, 'json')}>JSON</button>
                      {' '}
                      <button style={{ ...S.btn('ghost'), padding: '4px 10px', fontSize: 12 }} onClick={() => handleDownload(f.id, 'csv')}>CSV</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
