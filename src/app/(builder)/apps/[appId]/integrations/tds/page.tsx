'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { TDS_SECTIONS } from '@/platform/integrations/tds/rules';
import type { TDSConfig } from '@/platform/integrations/tds/types';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  container: {
    maxWidth: 860,
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
  subheading: {
    fontSize: 14,
    color: 'var(--fg-muted, #6b7280)',
    marginBottom: 32,
  } as React.CSSProperties,
  section: {
    background: 'var(--surface, #fff)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 8,
    padding: '24px',
    marginBottom: 24,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 16,
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  } as React.CSSProperties,
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  } as React.CSSProperties,
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--fg-muted, #374151)',
  } as React.CSSProperties,
  input: {
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border, #d1d5db)',
    fontSize: 14,
    background: 'var(--input-bg, #fff)',
    color: 'var(--fg, #111)',
    outline: 'none',
  } as React.CSSProperties,
  select: {
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border, #d1d5db)',
    fontSize: 14,
    background: 'var(--input-bg, #fff)',
    color: 'var(--fg, #111)',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  btnPrimary: {
    padding: '10px 24px',
    background: 'var(--accent, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    background: 'var(--surface-alt, #f9fafb)',
    borderBottom: '1px solid var(--border, #e5e7eb)',
    fontWeight: 600,
    color: 'var(--fg-muted, #374151)',
  } as React.CSSProperties,
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--border, #f3f4f6)',
    color: 'var(--fg, #374151)',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,
  statusBadge: (ok: boolean): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 99,
    fontSize: 12,
    fontWeight: 500,
    background: ok ? '#d1fae5' : '#fee2e2',
    color: ok ? '#065f46' : '#991b1b',
  }),
  alert: (kind: 'success' | 'error'): React.CSSProperties => ({
    padding: '10px 14px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
    background: kind === 'success' ? '#d1fae5' : '#fee2e2',
    color: kind === 'success' ? '#065f46' : '#991b1b',
    border: `1px solid ${kind === 'success' ? '#6ee7b7' : '#fca5a5'}`,
  }),
};

// ─── Types ────────────────────────────────────────────────────────────────────

type DeductorType = 'company' | 'individual' | 'government';

interface FormState {
  deductorPAN: string;
  deductorGSTIN: string;
  deductorName: string;
  deductorType: DeductorType;
  financialYear: string;
  vendorTableId: string;
  vendorFieldName: string;
  vendorFieldPAN: string;
  vendorFieldType: string;
  vendorFieldSection: string;
  vendorFieldExempt: string;
  paymentTableId: string;
  paymentFieldVendorId: string;
  paymentFieldAmount: string;
  paymentFieldDate: string;
  paymentFieldTdsAmount: string;
  paymentFieldTdsSection: string;
  paymentFieldNetAmount: string;
}

const DEFAULT_FORM: FormState = {
  deductorPAN: '',
  deductorGSTIN: '',
  deductorName: '',
  deductorType: 'company',
  financialYear: '2024-25',
  vendorTableId: '',
  vendorFieldName: 'name',
  vendorFieldPAN: 'pan',
  vendorFieldType: 'vendor_type',
  vendorFieldSection: 'tds_section',
  vendorFieldExempt: 'tds_exempt',
  paymentTableId: '',
  paymentFieldVendorId: 'vendor_id',
  paymentFieldAmount: 'amount',
  paymentFieldDate: 'payment_date',
  paymentFieldTdsAmount: 'tds_amount',
  paymentFieldTdsSection: 'tds_section',
  paymentFieldNetAmount: 'net_amount',
};

function formToConfig(f: FormState): TDSConfig {
  return {
    deductorPAN: f.deductorPAN,
    deductorGSTIN: f.deductorGSTIN,
    deductorName: f.deductorName,
    deductorType: f.deductorType,
    financialYear: f.financialYear,
    vendorTableId: f.vendorTableId,
    vendorFieldMapping: {
      name: f.vendorFieldName,
      pan: f.vendorFieldPAN,
      vendorType: f.vendorFieldType,
      tdsSection: f.vendorFieldSection,
      tdsExempt: f.vendorFieldExempt,
    },
    paymentTableId: f.paymentTableId,
    paymentFieldMapping: {
      vendorId: f.paymentFieldVendorId,
      amount: f.paymentFieldAmount,
      date: f.paymentFieldDate,
      tdsAmount: f.paymentFieldTdsAmount,
      tdsSection: f.paymentFieldTdsSection,
      netAmount: f.paymentFieldNetAmount,
    },
  };
}

function configToForm(c: TDSConfig): FormState {
  return {
    deductorPAN: c.deductorPAN,
    deductorGSTIN: c.deductorGSTIN,
    deductorName: c.deductorName,
    deductorType: c.deductorType,
    financialYear: c.financialYear,
    vendorTableId: c.vendorTableId,
    vendorFieldName: c.vendorFieldMapping.name,
    vendorFieldPAN: c.vendorFieldMapping.pan,
    vendorFieldType: c.vendorFieldMapping.vendorType,
    vendorFieldSection: c.vendorFieldMapping.tdsSection,
    vendorFieldExempt: c.vendorFieldMapping.tdsExempt,
    paymentTableId: c.paymentTableId,
    paymentFieldVendorId: c.paymentFieldMapping.vendorId,
    paymentFieldAmount: c.paymentFieldMapping.amount,
    paymentFieldDate: c.paymentFieldMapping.date,
    paymentFieldTdsAmount: c.paymentFieldMapping.tdsAmount,
    paymentFieldTdsSection: c.paymentFieldMapping.tdsSection,
    paymentFieldNetAmount: c.paymentFieldMapping.netAmount,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TDSIntegrationPage() {
  const params = useParams();
  const appId = params['appId'] as string;

  const [tenantSlug, setTenantSlug] = useState('');
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'setup' | 'reference'>('setup');

  useEffect(() => {
    const slug = document.cookie.match(/tenantSlug=([^;]+)/)?.[1]
      ?? window.location.hostname.split('.')[0]
      ?? '';
    setTenantSlug(slug);
  }, []);

  useEffect(() => {
    if (!tenantSlug || !appId) return;
    setLoading(true);
    fetch(`/api/builder/integrations/tds/config?tenantSlug=${encodeURIComponent(tenantSlug)}&appId=${encodeURIComponent(appId)}`)
      .then(r => r.json())
      .then((data: { config: TDSConfig | null }) => {
        if (data.config) setForm(configToForm(data.config));
      })
      .catch(() => setMessage({ kind: 'error', text: 'Failed to load existing config.' }))
      .finally(() => setLoading(false));
  }, [tenantSlug, appId]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/builder/integrations/tds/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, appId, config: formToConfig(form) }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) {
        setMessage({ kind: 'error', text: data.error ?? 'Failed to save config.' });
      } else {
        setMessage({ kind: 'success', text: 'TDS configuration saved successfully.' });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const financialYears = Array.from({ length: 5 }, (_, i) => {
    const year = 2022 + i;
    return `${year}-${String(year + 1).slice(2)}`;
  });

  if (loading) {
    return (
      <div style={S.container}>
        <p style={{ color: 'var(--fg-muted, #6b7280)', fontSize: 14 }}>Loading TDS configuration…</p>
      </div>
    );
  }

  return (
    <div style={S.container}>
      <h1 style={S.heading}>TDS Integration</h1>
      <p style={S.subheading}>
        Configure Tax Deducted at Source. Once set up, TDS is auto-calculated on every vendor payment.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border, #e5e7eb)', marginBottom: 24 }}>
        {(['setup', 'reference'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--accent, #6366f1)' : 'var(--fg-muted, #6b7280)',
              borderBottom: activeTab === tab ? '2px solid var(--accent, #6366f1)' : '2px solid transparent',
              marginBottom: -1,
              fontSize: 14,
              textTransform: 'capitalize',
            }}
          >
            {tab === 'setup' ? 'Setup' : 'TDS Section Reference'}
          </button>
        ))}
      </div>

      {activeTab === 'setup' && (
        <>
          {message && <div style={S.alert(message.kind)}>{message.text}</div>}

          {/* Step 1: Deductor Details */}
          <div style={S.section}>
            <div style={S.sectionTitle}>1. Deductor Details</div>
            <div style={S.grid2}>
              <div style={S.field}>
                <label style={S.label}>Deductor Name *</label>
                <input style={S.input} value={form.deductorName} onChange={e => set('deductorName', e.target.value)} placeholder="Your company name" />
              </div>
              <div style={S.field}>
                <label style={S.label}>Deductor PAN *</label>
                <input style={S.input} value={form.deductorPAN} onChange={e => set('deductorPAN', e.target.value.toUpperCase())} placeholder="AAAPL1234C" maxLength={10} />
              </div>
              <div style={S.field}>
                <label style={S.label}>GSTIN</label>
                <input style={S.input} value={form.deductorGSTIN} onChange={e => set('deductorGSTIN', e.target.value.toUpperCase())} placeholder="29AAAPL1234C1Z5" maxLength={15} />
              </div>
              <div style={S.field}>
                <label style={S.label}>Deductor Type *</label>
                <select style={S.select} value={form.deductorType} onChange={e => set('deductorType', e.target.value as DeductorType)}>
                  <option value="company">Company</option>
                  <option value="individual">Individual/HUF</option>
                  <option value="government">Government</option>
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Financial Year *</label>
                <select style={S.select} value={form.financialYear} onChange={e => set('financialYear', e.target.value)}>
                  {financialYears.map(fy => <option key={fy} value={fy}>{fy}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Step 2: Vendor Table */}
          <div style={S.section}>
            <div style={S.sectionTitle}>2. Vendor Table</div>
            <div style={{ ...S.field, marginBottom: 16 }}>
              <label style={S.label}>Vendor Table ID *</label>
              <input style={S.input} value={form.vendorTableId} onChange={e => set('vendorTableId', e.target.value)} placeholder="vendors" />
              <span style={{ fontSize: 12, color: 'var(--fg-muted, #9ca3af)' }}>The table that holds your vendor records.</span>
            </div>
            <div style={S.sectionTitle} hidden={false}>Field Mappings</div>
            <div style={S.grid2}>
              {([
                ['vendorFieldName', 'Vendor Name field', 'name'],
                ['vendorFieldPAN', 'PAN field', 'pan'],
                ['vendorFieldType', 'Vendor Type field (individual/company)', 'vendor_type'],
                ['vendorFieldSection', 'TDS Section field (e.g. 194C)', 'tds_section'],
                ['vendorFieldExempt', 'TDS Exempt field (boolean)', 'tds_exempt'],
              ] as [keyof FormState, string, string][]).map(([key, lbl, placeholder]) => (
                <div key={key} style={S.field}>
                  <label style={S.label}>{lbl}</label>
                  <input style={S.input} value={form[key] as string} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
                </div>
              ))}
            </div>
          </div>

          {/* Step 3: Payment Table */}
          <div style={S.section}>
            <div style={S.sectionTitle}>3. Payment Table</div>
            <div style={{ ...S.field, marginBottom: 16 }}>
              <label style={S.label}>Payment Table ID *</label>
              <input style={S.input} value={form.paymentTableId} onChange={e => set('paymentTableId', e.target.value)} placeholder="payments" />
              <span style={{ fontSize: 12, color: 'var(--fg-muted, #9ca3af)' }}>The table that holds payment records.</span>
            </div>
            <div style={S.sectionTitle}>Field Mappings</div>
            <div style={S.grid2}>
              {([
                ['paymentFieldVendorId', 'Vendor ID / Relation field', 'vendor_id'],
                ['paymentFieldAmount', 'Amount field', 'amount'],
                ['paymentFieldDate', 'Payment Date field', 'payment_date'],
                ['paymentFieldTdsAmount', 'TDS Amount field (write)', 'tds_amount'],
                ['paymentFieldTdsSection', 'TDS Section field (write)', 'tds_section'],
                ['paymentFieldNetAmount', 'Net Amount field (write)', 'net_amount'],
              ] as [keyof FormState, string, string][]).map(([key, lbl, placeholder]) => (
                <div key={key} style={S.field}>
                  <label style={S.label}>{lbl}</label>
                  <input style={S.input} value={form[key] as string} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
                </div>
              ))}
            </div>
          </div>

          <button style={S.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save TDS Configuration'}
          </button>
        </>
      )}

      {activeTab === 'reference' && (
        <div style={S.section}>
          <div style={S.sectionTitle}>TDS Section Reference</div>
          <p style={{ fontSize: 13, color: 'var(--fg-muted, #6b7280)', marginBottom: 16 }}>
            All applicable TDS sections. Rates shown are standard rates; surcharge and cess may apply separately.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Section', 'Description', 'Single Threshold', 'Annual Threshold', 'Individual %', 'Corporate %', 'No PAN %'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TDS_SECTIONS.map(s => (
                  <tr key={s.section}>
                    <td style={{ ...S.td, fontWeight: 600, color: 'var(--accent, #6366f1)' }}>{s.section}</td>
                    <td style={S.td}>{s.description}</td>
                    <td style={S.td}>{s.thresholdSingle > 0 ? `₹${s.thresholdSingle.toLocaleString('en-IN')}` : '—'}</td>
                    <td style={S.td}>{s.thresholdAnnual > 0 ? `₹${s.thresholdAnnual.toLocaleString('en-IN')}` : '—'}</td>
                    <td style={S.td}>{s.rateIndividual}%</td>
                    <td style={S.td}>{s.rateCorporate}%</td>
                    <td style={{ ...S.td, color: '#dc2626', fontWeight: 500 }}>{s.ratePANAbsent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
