'use client';

import React, { useState, useRef, useCallback } from 'react';
import type { ReconMatch, BankTransaction } from '@/platform/integrations/bankrecon/types';
import type { BankFormat } from '@/platform/integrations/bankrecon/parsers/csv-parser';

export interface BankReconPanelProps {
  tenantSlug: string;
  appId: string;
}

type Step = 'upload' | 'review' | 'summary';

interface UploadResponse {
  sessionId: string;
  totalTransactions: number;
  matchedCount: number;
  unmatchedCount: number;
  matches: ReconMatch[];
  statementPeriod: { from: string; to: string };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  panel: {
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'var(--fg, #111)',
    padding: '24px 0',
  } as React.CSSProperties,
  heading: { fontSize: 20, fontWeight: 700, marginBottom: 4 } as React.CSSProperties,
  sub: { fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginBottom: 24 } as React.CSSProperties,
  card: {
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
    background: 'var(--bg-card, #fff)',
  } as React.CSSProperties,
  dropZone: (dragging: boolean): React.CSSProperties => ({
    border: `2px dashed ${dragging ? '#6366f1' : 'var(--border, #d1d5db)'}`,
    borderRadius: 8,
    padding: '40px 24px',
    textAlign: 'center',
    cursor: 'pointer',
    background: dragging ? '#eef2ff' : 'var(--bg-subtle, #f9fafb)',
    transition: 'all 0.2s',
  }),
  select: {
    padding: '8px 12px',
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--bg-input, #fff)',
    color: 'var(--fg, #111)',
    marginBottom: 16,
    width: '100%',
    maxWidth: 320,
    display: 'block',
  } as React.CSSProperties,
  btn: (variant: 'primary' | 'ghost'): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '9px 18px',
    background: variant === 'primary' ? 'var(--accent, #6366f1)' : 'transparent',
    color: variant === 'primary' ? '#fff' : 'var(--fg, #111)',
    border: variant === 'ghost' ? '1px solid var(--border, #d1d5db)' : 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    gap: 6,
  }),
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    background: 'var(--bg-subtle, #f9fafb)',
    borderBottom: '1px solid var(--border, #e5e7eb)',
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--fg-muted, #6b7280)',
  } as React.CSSProperties,
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--border, #f3f4f6)',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,
  badge: (status: ReconMatch['status']): React.CSSProperties => {
    const colors: Record<ReconMatch['status'], { bg: string; color: string }> = {
      auto_matched: { bg: '#dcfce7', color: '#166534' },
      suggested: { bg: '#fef9c3', color: '#854d0e' },
      unmatched: { bg: '#fee2e2', color: '#991b1b' },
    };
    return {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      background: colors[status].bg,
      color: colors[status].color,
    };
  },
  statRow: {
    display: 'flex',
    gap: 20,
    marginBottom: 24,
  } as React.CSSProperties,
  stat: {
    flex: 1,
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 8,
    padding: '16px 20px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  statNum: { fontSize: 28, fontWeight: 700, color: 'var(--accent, #6366f1)' } as React.CSSProperties,
  statLabel: { fontSize: 12, color: 'var(--fg-muted, #6b7280)', marginTop: 4 } as React.CSSProperties,
  error: {
    padding: '10px 14px',
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
  } as React.CSSProperties,
};

const BANK_FORMATS: Array<{ value: BankFormat; label: string }> = [
  { value: 'generic', label: 'Auto-detect' },
  { value: 'hdfc_savings', label: 'HDFC Savings' },
  { value: 'hdfc_current', label: 'HDFC Current' },
  { value: 'icici_savings', label: 'ICICI Savings' },
  { value: 'sbi', label: 'SBI' },
  { value: 'axis', label: 'Axis Bank' },
  { value: 'kotak', label: 'Kotak' },
];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Math.abs(n));
}

function txAmount(tx: BankTransaction): string {
  if (tx.debit > 0) return `−${formatCurrency(tx.debit)}`;
  if (tx.credit > 0) return `+${formatCurrency(tx.credit)}`;
  return '—';
}

export function BankReconPanel({ tenantSlug, appId }: BankReconPanelProps) {
  const [step, setStep] = useState<Step>('upload');
  const [bankFormat, setBankFormat] = useState<BankFormat>('generic');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [sessionData, setSessionData] = useState<UploadResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bankFormat', bankFormat);

      // Load config to get ledgerTableId and fieldMapping
      const configRes = await fetch(`/api/builder/integrations/bankrecon/config?appId=${appId}`);
      const configJson = (await configRes.json()) as { config: { ledgerTableId: string; fieldMapping: Record<string, string> } | null };
      if (!configJson.config) {
        setError('Bank reconciliation not configured. Please contact your administrator.');
        return;
      }
      formData.append('ledgerTableId', configJson.config.ledgerTableId);
      formData.append('fieldMapping', JSON.stringify(configJson.config.fieldMapping));

      const res = await fetch(`/api/runtime/bankrecon/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setError(j.error ?? 'Upload failed');
        return;
      }
      const data = (await res.json()) as UploadResponse;
      setSessionData(data);
      setStep('review');
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [appId, bankFormat]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFileUpload(file);
  };

  const handleConfirm = async () => {
    if (!sessionData) return;
    setConfirming(true);
    setError('');
    try {
      const configRes = await fetch(`/api/builder/integrations/bankrecon/config?appId=${appId}`);
      const configJson = (await configRes.json()) as { config: { ledgerTableId: string; fieldMapping: Record<string, string> } | null };
      if (!configJson.config) {
        setError('Configuration missing.');
        return;
      }

      const confirmedMatches = sessionData.matches
        .map((m, i) => ({ bankTxnIndex: i, ledgerEntryId: m.ledgerEntry?.id ?? '' }))
        .filter((m) => m.ledgerEntryId);

      const res = await fetch('/api/runtime/bankrecon/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          confirmedMatches,
          fieldMapping: configJson.config.fieldMapping,
          ledgerTableId: configJson.config.ledgerTableId,
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setError(j.error ?? 'Confirm failed');
        return;
      }
      const result = (await res.json()) as { confirmedCount: number };
      setConfirmedCount(result.confirmedCount);
      setStep('summary');
    } catch {
      setError('Failed to confirm matches. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const reconciledAmount = sessionData
    ? sessionData.matches
        .filter((m) => m.status !== 'unmatched')
        .reduce((sum, m) => {
          const tx = m.bankTransaction;
          return sum + (tx.credit > 0 ? tx.credit : tx.debit);
        }, 0)
    : 0;

  // ─── Upload step ────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div style={S.panel}>
        <h2 style={S.heading}>Bank Reconciliation</h2>
        <p style={S.sub}>Upload your bank statement to match against ledger entries.</p>

        {error && <div style={S.error}>{error}</div>}

        <div style={S.card}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Bank Format
          </label>
          <select
            style={S.select}
            value={bankFormat}
            onChange={(e) => setBankFormat(e.target.value as BankFormat)}
          >
            {BANK_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          <div
            style={S.dropZone(dragging)}
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {uploading ? 'Uploading…' : 'Drop CSV file here or click to browse'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted, #6b7280)' }}>
              Supports CSV exports from HDFC, ICICI, SBI, Axis, Kotak
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileUpload(file);
            }}
          />
        </div>

        <p style={{ fontSize: 12, color: 'var(--fg-muted, #6b7280)' }}>
          Tenant: {tenantSlug} · App: {appId}
        </p>
      </div>
    );
  }

  // ─── Review step ────────────────────────────────────────────────────────────
  if (step === 'review' && sessionData) {
    const autoMatched = sessionData.matches.filter((m) => m.status === 'auto_matched').length;
    const suggested = sessionData.matches.filter((m) => m.status === 'suggested').length;
    const unmatched = sessionData.matches.filter((m) => m.status === 'unmatched').length;

    return (
      <div style={S.panel}>
        <h2 style={S.heading}>Review Matches</h2>
        <p style={S.sub}>
          {sessionData.totalTransactions} transactions · {autoMatched} auto-matched · {suggested} suggested · {unmatched} unmatched
        </p>

        {error && <div style={S.error}>{error}</div>}

        <div style={S.statRow}>
          <div style={S.stat}>
            <div style={{ ...S.statNum, color: '#16a34a' }}>{autoMatched}</div>
            <div style={S.statLabel}>Auto-matched</div>
          </div>
          <div style={S.stat}>
            <div style={{ ...S.statNum, color: '#ca8a04' }}>{suggested}</div>
            <div style={S.statLabel}>Suggested</div>
          </div>
          <div style={S.stat}>
            <div style={{ ...S.statNum, color: '#dc2626' }}>{unmatched}</div>
            <div style={S.statLabel}>Unmatched</div>
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Date</th>
                <th style={S.th}>Description</th>
                <th style={S.th}>Amount</th>
                <th style={S.th}>Ledger Match</th>
                <th style={S.th}>Confidence</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessionData.matches.map((match, i) => (
                <tr
                  key={i}
                  style={{
                    background:
                      match.status === 'auto_matched'
                        ? '#f0fdf4'
                        : match.status === 'suggested'
                        ? '#fefce8'
                        : '#fff1f2',
                  }}
                >
                  <td style={S.td}>{match.bankTransaction.date}</td>
                  <td style={S.td}>{match.bankTransaction.description}</td>
                  <td style={{ ...S.td, fontFamily: 'monospace' }}>{txAmount(match.bankTransaction)}</td>
                  <td style={S.td}>
                    {match.ledgerEntry ? (
                      <span>
                        <div style={{ fontWeight: 500 }}>{match.ledgerEntry.description}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted, #6b7280)' }}>{match.ledgerEntry.date}</div>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--fg-muted, #9ca3af)', fontSize: 12 }}>No match</span>
                    )}
                  </td>
                  <td style={S.td}>
                    {match.confidence > 0 ? `${Math.round(match.confidence * 100)}%` : '—'}
                  </td>
                  <td style={S.td}>
                    <span style={S.badge(match.status)}>
                      {match.status === 'auto_matched'
                        ? 'Matched'
                        : match.status === 'suggested'
                        ? 'Suggested'
                        : 'Unmatched'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button style={S.btn('primary')} onClick={handleConfirm} disabled={confirming}>
            {confirming ? 'Confirming…' : `Confirm ${autoMatched + suggested} Matches`}
          </button>
          <button style={S.btn('ghost')} onClick={() => { setStep('upload'); setSessionData(null); }}>
            Upload Different File
          </button>
        </div>
      </div>
    );
  }

  // ─── Summary step ───────────────────────────────────────────────────────────
  if (step === 'summary' && sessionData) {
    return (
      <div style={S.panel}>
        <h2 style={S.heading}>Reconciliation Complete</h2>
        <p style={S.sub}>
          Statement period: {sessionData.statementPeriod.from} to {sessionData.statementPeriod.to}
        </p>

        <div style={S.statRow}>
          <div style={S.stat}>
            <div style={S.statNum}>{sessionData.totalTransactions}</div>
            <div style={S.statLabel}>Total Transactions</div>
          </div>
          <div style={{ ...S.stat }}>
            <div style={{ ...S.statNum, color: '#16a34a' }}>{confirmedCount}</div>
            <div style={S.statLabel}>Reconciled</div>
          </div>
          <div style={{ ...S.stat }}>
            <div style={{ ...S.statNum, color: '#dc2626' }}>{sessionData.unmatchedCount}</div>
            <div style={S.statLabel}>Unmatched</div>
          </div>
          <div style={{ ...S.stat }}>
            <div style={{ ...S.statNum, color: '#6366f1', fontSize: 20 }}>
              {formatCurrency(reconciledAmount)}
            </div>
            <div style={S.statLabel}>Reconciled Amount</div>
          </div>
        </div>

        <button style={S.btn('primary')} onClick={() => { setStep('upload'); setSessionData(null); setConfirmedCount(0); }}>
          Reconcile Another Statement
        </button>
      </div>
    );
  }

  return null;
}
