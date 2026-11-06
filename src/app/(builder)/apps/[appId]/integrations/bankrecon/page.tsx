'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { BankReconConfig, LedgerFieldMapping } from '@/platform/integrations/bankrecon/types';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  container: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '32px 16px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  heading: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 8,
  } as React.CSSProperties,
  sub: {
    fontSize: 14,
    color: 'var(--fg-muted, #6b7280)',
    marginBottom: 32,
  } as React.CSSProperties,
  section: {
    marginBottom: 28,
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--bg-input, #fff)',
    color: 'var(--fg, #111)',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--bg-input, #fff)',
    color: 'var(--fg, #111)',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  } as React.CSSProperties,
  fieldCard: {
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 8,
    padding: '16px',
    marginBottom: 12,
  } as React.CSSProperties,
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: 'var(--accent, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  success: {
    marginTop: 12,
    padding: '10px 14px',
    background: '#dcfce7',
    color: '#166534',
    borderRadius: 6,
    fontSize: 13,
  } as React.CSSProperties,
  error: {
    marginTop: 12,
    padding: '10px 14px',
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 6,
    fontSize: 13,
  } as React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

const FIELD_MAPPING_KEYS: Array<{ key: keyof LedgerFieldMapping; label: string; required: boolean }> = [
  { key: 'date', label: 'Date field', required: true },
  { key: 'amount', label: 'Amount field', required: true },
  { key: 'description', label: 'Description field', required: true },
  { key: 'debitAmount', label: 'Debit amount field (optional)', required: false },
  { key: 'creditAmount', label: 'Credit amount field (optional)', required: false },
  { key: 'referenceNumber', label: 'Reference number field (optional)', required: false },
  { key: 'reconStatus', label: 'Reconciliation status field (mark as reconciled)', required: false },
  { key: 'bankTransactionId', label: 'Bank transaction ID field (optional)', required: false },
];

export default function BankReconConfigPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  const [ledgerTableId, setLedgerTableId] = useState('');
  const [bankName, setBankName] = useState('');
  const [fieldMapping, setFieldMapping] = useState<LedgerFieldMapping>({
    date: '',
    amount: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/builder/integrations/bankrecon/config?appId=${appId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { config: BankReconConfig | null };
      if (data.config) {
        setLedgerTableId(data.config.ledgerTableId);
        setBankName(data.config.bankName ?? '');
        setFieldMapping(data.config.fieldMapping);
      }
    } catch {
      // silent — first-time setup
    }
  }, [appId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    if (!ledgerTableId.trim()) {
      setError('Ledger table ID is required.');
      return;
    }
    if (!fieldMapping.date || !fieldMapping.amount || !fieldMapping.description) {
      setError('Date, Amount, and Description fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const config: BankReconConfig = { ledgerTableId, fieldMapping, bankName: bankName || undefined };
      const res = await fetch('/api/builder/integrations/bankrecon/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, config }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setError(j.error ?? 'Save failed');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.container}>
      <h1 style={S.heading}>Bank Reconciliation Setup</h1>
      <p style={S.sub}>Configure which table holds your payment/ledger entries and map its fields.</p>

      <div style={S.section}>
        <label style={S.label}>Ledger Table ID</label>
        <input
          style={S.input}
          value={ledgerTableId}
          onChange={(e) => setLedgerTableId(e.target.value)}
          placeholder="e.g. payments, transactions, ledger_entries"
        />
      </div>

      <div style={S.section}>
        <label style={S.label}>Bank Name (optional)</label>
        <input
          style={S.input}
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          placeholder="e.g. HDFC, ICICI, SBI"
        />
      </div>

      <div style={S.section}>
        <label style={S.label}>Field Mapping</label>
        <div style={S.fieldCard}>
          <div style={S.grid}>
            {FIELD_MAPPING_KEYS.map(({ key, label }) => (
              <div key={key}>
                <label style={{ ...S.label, fontSize: 12 }}>{label}</label>
                <input
                  style={S.input}
                  value={(fieldMapping[key] as string | undefined) ?? ''}
                  onChange={(e) => setFieldMapping((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={key}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <button style={S.btn} onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Configuration'}
      </button>

      {saved && <div style={S.success}>Configuration saved successfully.</div>}
      {error && <div style={S.error}>{error}</div>}
    </div>
  );
}
