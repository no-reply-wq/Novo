'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { GSTR1Config, GSTR1FieldMapping } from '@/platform/integrations/gstr1/types';
import { isValidGSTIN } from '@/platform/integrations/gstr1/aggregator';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'business' | 'table' | 'mapping' | 'preview';

interface TableOption {
  id: string;
  name: string;
  columns: string[];
}

const REQUIRED_FIELDS: Array<{ key: keyof GSTR1FieldMapping; label: string; required: boolean }> = [
  { key: 'invoiceNumber', label: 'Invoice Number', required: true },
  { key: 'invoiceDate', label: 'Invoice Date', required: true },
  { key: 'invoiceType', label: 'Invoice Type (B2B/B2C/CN/DN)', required: true },
  { key: 'buyerGstin', label: 'Buyer GSTIN', required: false },
  { key: 'buyerName', label: 'Buyer Name', required: false },
  { key: 'buyerStateCode', label: 'Buyer State Code', required: true },
  { key: 'placeOfSupply', label: 'Place of Supply (State Code)', required: true },
  { key: 'reverseCharge', label: 'Reverse Charge (Y/N)', required: false },
  { key: 'invoiceValue', label: 'Invoice Value (Total)', required: true },
  { key: 'taxableValue', label: 'Taxable Value', required: true },
  { key: 'igstAmount', label: 'IGST Amount', required: false },
  { key: 'cgstAmount', label: 'CGST Amount', required: false },
  { key: 'sgstAmount', label: 'SGST Amount', required: false },
  { key: 'cessAmount', label: 'CESS Amount', required: false },
  { key: 'hsnCode', label: 'HSN / SAC Code', required: false },
  { key: 'itemDescription', label: 'Item Description', required: false },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  container: { maxWidth: 720, margin: '0 auto', padding: '32px 16px', fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--fg, #111)' } as React.CSSProperties,
  heading: { fontSize: 22, fontWeight: 700, marginBottom: 4 } as React.CSSProperties,
  sub: { fontSize: 14, color: 'var(--fg-muted, #6b7280)', marginBottom: 32 } as React.CSSProperties,
  steps: { display: 'flex', gap: 0, marginBottom: 32, borderBottom: '1px solid var(--border, #e5e7eb)' } as React.CSSProperties,
  stepBtn: (active: boolean): React.CSSProperties => ({
    padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13,
    fontWeight: active ? 600 : 400, color: active ? 'var(--accent, #6366f1)' : 'var(--fg-muted, #6b7280)',
    borderBottom: active ? '2px solid var(--accent, #6366f1)' : '2px solid transparent', whiteSpace: 'nowrap',
  }),
  card: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: 24, marginBottom: 16, background: 'var(--bg-card, #fff)' } as React.CSSProperties,
  label: { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--fg, #111)' } as React.CSSProperties,
  input: { width: '100%', padding: '8px 12px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const, background: 'var(--bg-input, #fff)' },
  select: { width: '100%', padding: '8px 12px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const, background: 'var(--bg-input, #fff)' },
  row: { marginBottom: 20 } as React.CSSProperties,
  btn: (variant: 'primary' | 'secondary'): React.CSSProperties => ({
    padding: '10px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
    background: variant === 'primary' ? 'var(--accent, #6366f1)' : 'var(--bg-muted, #f3f4f6)',
    color: variant === 'primary' ? '#fff' : 'var(--fg, #111)', marginRight: 8,
  }),
  error: { fontSize: 12, color: '#dc2626', marginTop: 4 } as React.CSSProperties,
  badge: (type: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
    background: type === 'B2B' ? '#ede9fe' : type === 'B2CL' ? '#fef3c7' : type === 'B2CS' ? '#d1fae5' : '#fee2e2',
    color: type === 'B2B' ? '#7c3aed' : type === 'B2CL' ? '#d97706' : type === 'B2CS' ? '#065f46' : '#dc2626',
  }),
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function GSTR1BuilderPage(): React.ReactElement {
  const params = useParams();
  const appId = params['appId'] as string;

  const [step, setStep] = useState<Step>('business');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tenantSlug, setTenantSlug] = useState('');

  // Business details
  const [gstin, setGstin] = useState('');
  const [legalName, setLegalName] = useState('');
  const [gstinError, setGstinError] = useState<string | null>(null);

  // Table selection
  const [tables, setTables] = useState<TableOption[]>([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [loadingTables, setLoadingTables] = useState(false);

  // Field mapping
  const [mapping, setMapping] = useState<Partial<GSTR1FieldMapping>>({});

  // Preview
  const [previewRows, setPreviewRows] = useState<Array<{ invoiceNo: string; classification: string; value: string }>>([]);

  // Load tenant slug from session
  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((s: { user?: { tenantSlug?: string } }) => {
        if (s?.user?.tenantSlug) setTenantSlug(s.user.tenantSlug);
      })
      .catch(() => {/* ignore */});
  }, []);

  // Load existing config
  useEffect(() => {
    if (!tenantSlug || !appId) return;
    fetch(`/api/builder/integrations/gstr1/config?tenant=${tenantSlug}&appId=${appId}`)
      .then((r) => r.json())
      .then((data: { config: GSTR1Config | null }) => {
        if (data.config) {
          setGstin(data.config.gstin);
          setLegalName(data.config.legalName);
          setSelectedTableId(data.config.invoiceTableId);
          setMapping(data.config.fieldMapping);
        }
      })
      .catch(() => {/* ignore */});
  }, [tenantSlug, appId]);

  // Load tables when moving to table step
  const loadTables = useCallback(() => {
    if (!tenantSlug) return;
    setLoadingTables(true);
    fetch(`/api/builder/apps/${appId}/tables?tenant=${tenantSlug}`)
      .then((r) => r.json())
      .then((data: { tables?: TableOption[] }) => {
        setTables(data.tables ?? []);
      })
      .catch(() => setTables([]))
      .finally(() => setLoadingTables(false));
  }, [tenantSlug, appId]);

  const selectedTable = tables.find((t) => t.id === selectedTableId);

  const validateGSTIN = (value: string): boolean => {
    if (!value) { setGstinError('GSTIN is required'); return false; }
    if (!isValidGSTIN(value)) { setGstinError('Invalid GSTIN format (15 characters, e.g. 27AAPFU0939F1ZV)'); return false; }
    setGstinError(null);
    return true;
  };

  const saveConfig = async () => {
    if (!validateGSTIN(gstin)) return;
    if (!legalName) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/builder/integrations/gstr1/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          appId,
          config: {
            gstin,
            legalName,
            invoiceTableId: selectedTableId,
            fieldMapping: mapping,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setSaveError(err.error ?? 'Save failed');
      }
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const buildPreview = useCallback(() => {
    // Show sample classification based on mapping (static demo rows)
    setPreviewRows([
      { invoiceNo: 'INV-001', classification: 'B2B', value: '₹11,800' },
      { invoiceNo: 'INV-002', classification: 'B2CL', value: '₹3,54,000' },
      { invoiceNo: 'INV-003', classification: 'B2CS', value: '₹5,900' },
    ]);
  }, []);

  useEffect(() => {
    if (step === 'preview') buildPreview();
    if (step === 'table') loadTables();
  }, [step, buildPreview, loadTables]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const steps: Array<{ key: Step; label: string }> = [
    { key: 'business', label: '1. Business Details' },
    { key: 'table', label: '2. Invoice Table' },
    { key: 'mapping', label: '3. Field Mapping' },
    { key: 'preview', label: '4. Preview' },
  ];

  return (
    <div style={S.container}>
      <h1 style={S.heading}>GST R1 Filing Setup</h1>
      <p style={S.sub}>Map your invoice table once, then generate monthly GST R1 returns.</p>

      <div style={S.steps}>
        {steps.map((s) => (
          <button key={s.key} style={S.stepBtn(step === s.key)} onClick={() => setStep(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Step 1: Business Details ─────────────────────────────────────── */}
      {step === 'business' && (
        <div style={S.card}>
          <div style={S.row}>
            <label style={S.label}>GSTIN *</label>
            <input
              style={S.input}
              value={gstin}
              onChange={(e) => { setGstin(e.target.value.toUpperCase()); setGstinError(null); }}
              onBlur={() => validateGSTIN(gstin)}
              placeholder="e.g. 27AAPFU0939F1ZV"
              maxLength={15}
            />
            {gstinError && <p style={S.error}>{gstinError}</p>}
          </div>
          <div style={S.row}>
            <label style={S.label}>Legal Business Name *</label>
            <input
              style={S.input}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="As per GST registration"
            />
          </div>
          {saveError && <p style={S.error}>{saveError}</p>}
          <button
            style={S.btn('primary')}
            onClick={() => {
              if (validateGSTIN(gstin) && legalName) setStep('table');
            }}
          >
            Next: Invoice Table →
          </button>
        </div>
      )}

      {/* ── Step 2: Invoice Table ─────────────────────────────────────────── */}
      {step === 'table' && (
        <div style={S.card}>
          <div style={S.row}>
            <label style={S.label}>Select Invoice Table *</label>
            {loadingTables ? (
              <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)' }}>Loading tables…</p>
            ) : (
              <select
                style={S.select}
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
              >
                <option value="">— Select a table —</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
          <button style={S.btn('secondary')} onClick={() => setStep('business')}>← Back</button>
          <button
            style={S.btn('primary')}
            onClick={() => { if (selectedTableId) setStep('mapping'); }}
            disabled={!selectedTableId}
          >
            Next: Field Mapping →
          </button>
        </div>
      )}

      {/* ── Step 3: Field Mapping ─────────────────────────────────────────── */}
      {step === 'mapping' && (
        <div style={S.card}>
          <p style={{ fontSize: 13, marginBottom: 20, color: 'var(--fg-muted, #6b7280)' }}>
            Map each GST R1 field to a column in your <strong>{selectedTable?.name ?? selectedTableId}</strong> table.
          </p>
          {REQUIRED_FIELDS.map((field) => (
            <div key={field.key} style={S.row}>
              <label style={S.label}>
                {field.label}{field.required ? ' *' : ''}
              </label>
              {selectedTable ? (
                <select
                  style={S.select}
                  value={mapping[field.key] ?? ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                >
                  <option value="">— Select column —</option>
                  {selectedTable.columns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              ) : (
                <input
                  style={S.input}
                  value={mapping[field.key] ?? ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder="column name"
                />
              )}
            </div>
          ))}
          <button style={S.btn('secondary')} onClick={() => setStep('table')}>← Back</button>
          <button
            style={S.btn('primary')}
            onClick={async () => {
              await saveConfig();
              setStep('preview');
            }}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save & Preview →'}
          </button>
          {saveError && <p style={S.error}>{saveError}</p>}
        </div>
      )}

      {/* ── Step 4: Preview ───────────────────────────────────────────────── */}
      {step === 'preview' && (
        <div style={S.card}>
          <p style={{ fontSize: 13, marginBottom: 16, color: 'var(--fg-muted, #6b7280)' }}>
            Sample classification of your invoices based on the mapping above:
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Invoice No</th>
                <th style={{ padding: '8px 12px' }}>Classification</th>
                <th style={{ padding: '8px 12px' }}>Invoice Value</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={row.invoiceNo} style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                  <td style={{ padding: '8px 12px' }}>{row.invoiceNo}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={S.badge(row.classification)}>{row.classification}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 24 }}>
            <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginBottom: 16 }}>
              Configuration saved. Your accountants can now generate the monthly GST R1 from the runtime panel.
            </p>
            <button style={S.btn('secondary')} onClick={() => setStep('mapping')}>← Edit Mapping</button>
          </div>
        </div>
      )}
    </div>
  );
}
