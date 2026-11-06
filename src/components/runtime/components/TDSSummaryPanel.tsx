'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { TDSSummary } from '@/platform/integrations/tds/calculator';

export interface TDSSummaryPanelProps {
  tenantSlug: string;
  appId: string;
}

type Quarter = 1 | 2 | 3 | 4 | 'full';

interface SummaryResponse {
  financialYear: string;
  quarter: number | null;
  summary: TDSSummary[];
}

const FINANCIAL_YEARS = Array.from({ length: 5 }, (_, i) => {
  const year = 2022 + i;
  return `${year}-${String(year + 1).slice(2)}`;
});

const fmtINR = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TDSSummaryPanel({ tenantSlug, appId }: TDSSummaryPanelProps) {
  const [financialYear, setFinancialYear] = useState('2024-25');
  const [quarter, setQuarter] = useState<Quarter>('full');
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ tenantSlug, appId: appId ?? '', financialYear });
    if (quarter !== 'full') qs.set('quarter', String(quarter));

    try {
      const res = await fetch(`/api/runtime/tds/summary?${qs.toString()}`);
      const json: SummaryResponse & { error?: string } = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load TDS summary.');
      } else {
        setData(json);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, appId, financialYear, quarter]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleDownload = () => {
    const qs = new URLSearchParams({ tenantSlug, appId: appId ?? '', financialYear });
    if (quarter !== 'full') qs.set('quarter', String(quarter));
    window.open(`/api/runtime/tds/download?${qs.toString()}`, '_blank');
  };

  const totals = data?.summary.reduce(
    (acc, row) => ({
      totalPayments: acc.totalPayments + row.totalPayments,
      totalTDS: acc.totalTDS + row.totalTDS,
      netPayments: acc.netPayments + row.netPayments,
    }),
    { totalPayments: 0, totalTDS: 0, netPayments: 0 },
  ) ?? { totalPayments: 0, totalTDS: 0, netPayments: 0 };

  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        color: 'var(--fg, #111)',
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8,
        padding: 24,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>TDS Summary (26Q)</div>
          <div style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginTop: 2 }}>
            Quarterly TDS summary for TRACES portal filing.
          </div>
        </div>
        <button
          onClick={handleDownload}
          style={{
            padding: '8px 14px',
            border: '1px solid var(--accent, #6366f1)',
            borderRadius: 6,
            background: 'transparent',
            color: 'var(--accent, #6366f1)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Download 26Q CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4, color: 'var(--fg-muted, #374151)' }}>
            Financial Year
          </label>
          <select
            value={financialYear}
            onChange={e => setFinancialYear(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border, #d1d5db)',
              fontSize: 13,
              background: 'var(--input-bg, #fff)',
              color: 'var(--fg, #111)',
            }}
          >
            {FINANCIAL_YEARS.map(fy => <option key={fy} value={fy}>{fy}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4, color: 'var(--fg-muted, #374151)' }}>
            Quarter
          </label>
          <select
            value={String(quarter)}
            onChange={e => setQuarter(e.target.value === 'full' ? 'full' : (parseInt(e.target.value, 10) as 1 | 2 | 3 | 4))}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--border, #d1d5db)',
              fontSize: 13,
              background: 'var(--input-bg, #fff)',
              color: 'var(--fg, #111)',
            }}
          >
            <option value="full">Full Year</option>
            <option value="1">Q1 (Apr–Jun)</option>
            <option value="2">Q2 (Jul–Sep)</option>
            <option value="3">Q3 (Oct–Dec)</option>
            <option value="4">Q4 (Jan–Mar)</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div style={{ padding: '20px 0', fontSize: 13, color: 'var(--fg-muted, #6b7280)', textAlign: 'center' }}>
          Loading…
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: 6,
            fontSize: 13,
            color: '#991b1b',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Vendor', 'PAN', 'Section', 'Total Payments', 'TDS Deducted', 'Net Paid'].map(h => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: 'var(--surface-alt, #f9fafb)',
                      borderBottom: '1px solid var(--border, #e5e7eb)',
                      fontWeight: 600,
                      color: 'var(--fg-muted, #374151)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.summary.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--fg-muted, #9ca3af)', fontSize: 13 }}>
                    No TDS records for this period.
                  </td>
                </tr>
              ) : (
                data.summary.map((row, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border, #f3f4f6)' }}>{row.vendorName}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border, #f3f4f6)', fontFamily: 'monospace' }}>{row.vendorPAN || '—'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border, #f3f4f6)', fontWeight: 600, color: 'var(--accent, #6366f1)' }}>{row.section}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border, #f3f4f6)', textAlign: 'right' }}>{fmtINR(row.totalPayments)}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border, #f3f4f6)', textAlign: 'right', color: '#dc2626', fontWeight: 500 }}>{fmtINR(row.totalTDS)}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border, #f3f4f6)', textAlign: 'right' }}>{fmtINR(row.netPayments)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {data.summary.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ padding: '10px', fontWeight: 700, background: 'var(--surface-alt, #f9fafb)', borderTop: '2px solid var(--border, #e5e7eb)' }}>Total</td>
                  <td style={{ padding: '10px', fontWeight: 700, textAlign: 'right', background: 'var(--surface-alt, #f9fafb)', borderTop: '2px solid var(--border, #e5e7eb)' }}>{fmtINR(totals.totalPayments)}</td>
                  <td style={{ padding: '10px', fontWeight: 700, textAlign: 'right', background: 'var(--surface-alt, #f9fafb)', borderTop: '2px solid var(--border, #e5e7eb)', color: '#dc2626' }}>{fmtINR(totals.totalTDS)}</td>
                  <td style={{ padding: '10px', fontWeight: 700, textAlign: 'right', background: 'var(--surface-alt, #f9fafb)', borderTop: '2px solid var(--border, #e5e7eb)' }}>{fmtINR(totals.netPayments)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
