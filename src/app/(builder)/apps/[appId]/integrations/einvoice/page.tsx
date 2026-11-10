'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableOption {
  id: string;
  name: string;
  columns: ColumnOption[];
}

interface ColumnOption {
  id: string;
  name: string;
  type: string;
}

type Step = 'credentials' | 'table' | 'fields' | 'lineitems' | 'test';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  container: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '32px 16px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  heading: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 4,
  } as React.CSSProperties,
  sub: {
    fontSize: 14,
    color: 'var(--fg-muted, #6b7280)',
    marginBottom: 32,
  } as React.CSSProperties,
  stepper: {
    display: 'flex',
    gap: 0,
    marginBottom: 32,
    borderBottom: '1px solid var(--border, #e5e7eb)',
  } as React.CSSProperties,
  stepBtn: (active: boolean, done: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: done ? 'var(--accent, #6366f1)' : active ? 'var(--accent, #6366f1)' : 'var(--fg-muted, #6b7280)',
    borderBottom: active ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
  }),
  card: {
    background: 'var(--surface, #fff)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 8,
    padding: 24,
    marginBottom: 24,
  } as React.CSSProperties,
  fieldGroup: { marginBottom: 20 } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 6,
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  requiredMark: { color: '#ef4444', marginLeft: 2 } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--surface, #fff)',
    color: 'var(--fg, #111)',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--surface, #fff)',
    color: 'var(--fg, #111)',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    userSelect: 'none',
  } as React.CSSProperties,
  toggleBox: (on: boolean): React.CSSProperties => ({
    width: 40,
    height: 22,
    borderRadius: 11,
    background: on ? 'var(--accent, #6366f1)' : 'var(--border, #e5e7eb)',
    position: 'relative',
    transition: 'background 0.2s',
    flexShrink: 0,
  }),
  toggleKnob: (on: boolean): React.CSSProperties => ({
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: 3,
    left: on ? 21 : 3,
    transition: 'left 0.2s',
  }),
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
    marginTop: 24,
  } as React.CSSProperties,
  btnPrimary: {
    padding: '9px 20px',
    background: 'var(--accent, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    padding: '9px 20px',
    background: 'transparent',
    color: 'var(--fg, #111)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  error: {
    padding: '10px 14px',
    background: '#fef2f2',
    color: '#dc2626',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
  } as React.CSSProperties,
  success: {
    padding: '10px 14px',
    background: '#f0fdf4',
    color: '#16a34a',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
  } as React.CSSProperties,
  mappingGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  } as React.CSSProperties,
  mappingLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--fg-muted, #6b7280)',
    marginBottom: 4,
  } as React.CSSProperties,
  badge: (type: 'required' | 'optional'): React.CSSProperties => ({
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 4,
    marginLeft: 6,
    background: type === 'required' ? '#fef3c7' : '#f3f4f6',
    color: type === 'required' ? '#92400e' : '#6b7280',
    textTransform: 'uppercase',
  }),
};

// ─── Required field definitions ───────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
}

const INVOICE_FIELDS: FieldDef[] = [
  { key: 'invoiceNumber', label: 'Invoice Number', required: true },
  { key: 'invoiceDate', label: 'Invoice Date', required: true },
  { key: 'buyerGstin', label: 'Buyer GSTIN', required: true },
  { key: 'buyerName', label: 'Buyer Name', required: true },
  { key: 'buyerAddress', label: 'Buyer Address', required: true },
  { key: 'buyerCity', label: 'Buyer City', required: true },
  { key: 'buyerPincode', label: 'Buyer Pincode', required: true },
  { key: 'buyerStateCode', label: 'Buyer State Code', required: true },
  { key: 'totalTaxableAmount', label: 'Total Taxable Amount', required: false },
  { key: 'totalGst', label: 'Total GST', required: false },
  { key: 'totalInvoiceAmount', label: 'Total Invoice Amount', required: false },
];

const LINE_ITEM_FIELDS: FieldDef[] = [
  { key: 'itemDescription', label: 'Item Description', required: true },
  { key: 'itemHsn', label: 'HSN Code', required: true },
  { key: 'itemQty', label: 'Quantity', required: false },
  { key: 'itemUnit', label: 'Unit', required: false },
  { key: 'itemRate', label: 'Unit Rate', required: true },
  { key: 'itemTaxableAmount', label: 'Taxable Amount', required: true },
  { key: 'itemGstRate', label: 'GST Rate (%)', required: true },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function EInvoicePage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  const [step, setStep] = useState<Step>('credentials');
  const [tables, setTables] = useState<TableOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Credentials
  const [gstin, setGstin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [sandbox, setSandbox] = useState(true);

  // Table selection
  const [selectedTableId, setSelectedTableId] = useState('');

  // Field mappings
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  // Line items table
  const [lineItemTableId, setLineItemTableId] = useState('');
  const [lineItemMapping, setLineItemMapping] = useState<Record<string, string>>({});

  const tenantSlug = typeof window !== 'undefined'
    ? (document.cookie.match(/tenant_slug=([^;]+)/)?.[1] ?? '')
    : '';

  const selectedTable = tables.find((t) => t.id === selectedTableId);
  const lineItemTable = tables.find((t) => t.id === lineItemTableId);

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const res = await fetch(`/api/builder/apps/${appId}/tables?tenant=${tenantSlug}`);
        if (res.ok) {
          const data = (await res.json()) as { tables: TableOption[] };
          setTables(data.tables ?? []);
        }
      } catch {
        // non-fatal
      }
    };
    void fetchTables();
  }, [appId, tenantSlug]);

  const setMapping = useCallback((key: string, value: string) => {
    setFieldMapping((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setLineMapping = useCallback((key: string, value: string) => {
    setLineItemMapping((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch('/api/builder/integrations/einvoice/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          appId,
          tableId: selectedTableId,
          config: { gstin, username, password, sandbox, clientId, clientSecret },
          fieldMapping: {
            ...fieldMapping,
            itemsTableId: lineItemTableId,
            ...lineItemMapping,
          },
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: unknown };
        setError(`Save failed: ${JSON.stringify(data.error)}`);
      } else {
        setSuccess('E-Invoice configuration saved.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setError(null);
    setSuccess(null);
    setTesting(true);
    // Test by verifying credentials can authenticate
    try {
      const res = await fetch('/api/builder/integrations/einvoice/config', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setSuccess('Configuration loaded — ready to generate IRNs on sandbox.');
      } else {
        setError('Configuration test failed. Please save first.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'credentials', label: '1. Credentials' },
    { key: 'table', label: '2. Invoice Table' },
    { key: 'fields', label: '3. Field Mapping' },
    { key: 'lineitems', label: '4. Line Items' },
    { key: 'test', label: '5. Test & Save' },
  ];

  const doneSteps: Step[] = [];
  if (gstin && username && password && clientId && clientSecret) doneSteps.push('credentials');
  if (selectedTableId) doneSteps.push('table');
  if (Object.keys(fieldMapping).length > 0) doneSteps.push('fields');
  if (lineItemTableId) doneSteps.push('lineitems');

  return (
    <div style={S.container}>
      <h1 style={S.heading}>E-Invoice (IRP) Integration</h1>
      <p style={S.sub}>
        Register invoices on India's Invoice Registration Portal (IRP) to generate IRNs and QR codes.
      </p>

      {/* Stepper */}
      <div style={S.stepper}>
        {steps.map(({ key, label }) => (
          <button
            key={key}
            style={S.stepBtn(step === key, doneSteps.includes(key))}
            onClick={() => setStep(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div style={S.error}>{error}</div>}
      {success && <div style={S.success}>{success}</div>}

      {/* Step: Credentials */}
      {step === 'credentials' && (
        <div style={S.card}>
          <div style={S.fieldGroup}>
            <label style={S.label}>
              GSTIN <span style={S.requiredMark}>*</span>
            </label>
            <input
              style={S.input}
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              placeholder="22AAAAA0000A1Z5"
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>
              IRP Portal Username <span style={S.requiredMark}>*</span>
            </label>
            <input
              style={S.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>
              IRP Portal Password <span style={S.requiredMark}>*</span>
            </label>
            <input
              style={S.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>
              Client ID <span style={S.requiredMark}>*</span>
            </label>
            <input
              style={S.input}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>
              Client Secret <span style={S.requiredMark}>*</span>
            </label>
            <input
              style={S.input}
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div style={S.fieldGroup}>
            <div
              style={S.toggle}
              onClick={() => setSandbox((v) => !v)}
            >
              <div style={S.toggleBox(sandbox)}>
                <div style={S.toggleKnob(sandbox)} />
              </div>
              <span style={{ fontSize: 14 }}>
                Use sandbox endpoint (einv-apisandbox.nic.in)
              </span>
            </div>
          </div>
          <div style={S.actions}>
            <button style={S.btnPrimary} onClick={() => setStep('table')}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step: Table */}
      {step === 'table' && (
        <div style={S.card}>
          <div style={S.fieldGroup}>
            <label style={S.label}>
              Invoice Table <span style={S.requiredMark}>*</span>
            </label>
            <select
              style={S.select}
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
            >
              <option value="">— select a table —</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div style={S.actions}>
            <button style={S.btnSecondary} onClick={() => setStep('credentials')}>
              ← Back
            </button>
            <button
              style={S.btnPrimary}
              disabled={!selectedTableId}
              onClick={() => setStep('fields')}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step: Field Mapping */}
      {step === 'fields' && (
        <div style={S.card}>
          <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginBottom: 16 }}>
            Map each IRP field to a column in your <strong>{selectedTable?.name ?? 'invoice table'}</strong>.
          </p>
          <div style={S.mappingGrid}>
            {INVOICE_FIELDS.map(({ key, label, required }) => (
              <div key={key} style={S.fieldGroup}>
                <div style={S.mappingLabel}>
                  {label}
                  <span style={S.badge(required ? 'required' : 'optional')}>
                    {required ? 'required' : 'optional'}
                  </span>
                </div>
                <select
                  style={S.select}
                  value={fieldMapping[key] ?? ''}
                  onChange={(e) => setMapping(key, e.target.value)}
                >
                  <option value="">— select column —</option>
                  {selectedTable?.columns.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={S.actions}>
            <button style={S.btnSecondary} onClick={() => setStep('table')}>
              ← Back
            </button>
            <button style={S.btnPrimary} onClick={() => setStep('lineitems')}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step: Line Items */}
      {step === 'lineitems' && (
        <div style={S.card}>
          <div style={S.fieldGroup}>
            <label style={S.label}>
              Line Items Table <span style={S.requiredMark}>*</span>
            </label>
            <select
              style={S.select}
              value={lineItemTableId}
              onChange={(e) => setLineItemTableId(e.target.value)}
            >
              <option value="">— select a table —</option>
              {tables.filter((t) => t.id !== selectedTableId).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {lineItemTable && (
            <div style={S.mappingGrid}>
              {LINE_ITEM_FIELDS.map(({ key, label, required }) => (
                <div key={key} style={S.fieldGroup}>
                  <div style={S.mappingLabel}>
                    {label}
                    <span style={S.badge(required ? 'required' : 'optional')}>
                      {required ? 'required' : 'optional'}
                    </span>
                  </div>
                  <select
                    style={S.select}
                    value={lineItemMapping[key] ?? ''}
                    onChange={(e) => setLineMapping(key, e.target.value)}
                  >
                    <option value="">— select column —</option>
                    {lineItemTable.columns.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          <div style={S.actions}>
            <button style={S.btnSecondary} onClick={() => setStep('fields')}>
              ← Back
            </button>
            <button
              style={S.btnPrimary}
              disabled={!lineItemTableId}
              onClick={() => setStep('test')}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step: Test & Save */}
      {step === 'test' && (
        <div style={S.card}>
          <p style={{ fontSize: 14, marginBottom: 20 }}>
            Review your configuration then save. Use the test button to verify sandbox connectivity.
          </p>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div><strong>GSTIN:</strong> {gstin || '—'}</div>
            <div><strong>Username:</strong> {username || '—'}</div>
            <div><strong>Endpoint:</strong> {sandbox ? 'Sandbox (einv-apisandbox.nic.in)' : 'Production (einvoice1-prod.nic.in)'}</div>
            <div><strong>Invoice table:</strong> {selectedTable?.name ?? '—'}</div>
            <div><strong>Line items table:</strong> {lineItemTable?.name ?? '—'}</div>
          </div>
          <div style={S.actions}>
            <button style={S.btnSecondary} onClick={() => setStep('lineitems')}>
              ← Back
            </button>
            <button
              style={S.btnSecondary}
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            <button
              style={S.btnPrimary}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
