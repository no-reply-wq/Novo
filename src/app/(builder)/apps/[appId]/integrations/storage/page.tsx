'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = 's3' | 'r2';

interface StorageFormState {
  provider: Provider;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  allowedTypes: string[];
  maxSizeMb: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FILE_TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Images (JPEG, PNG, GIF, WebP)', value: 'image' },
  { label: 'PDF Documents', value: 'application/pdf' },
  { label: 'Word Documents (.docx)', value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { label: 'Excel Spreadsheets (.xlsx)', value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { label: 'CSV Files', value: 'text/csv' },
  { label: 'ZIP Archives', value: 'application/zip' },
];

const DEFAULT_STATE: StorageFormState = {
  provider: 's3',
  bucket: '',
  region: 'us-east-1',
  endpoint: '',
  accessKeyId: '',
  secretAccessKey: '',
  publicBaseUrl: '',
  allowedTypes: ['image', 'application/pdf'],
  maxSizeMb: 50,
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    maxWidth: 680,
    margin: '0 auto',
    padding: '32px 16px',
    fontFamily: 'Inter, system-ui, sans-serif',
  } as React.CSSProperties,
  heading: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  sub: {
    fontSize: 14,
    color: 'var(--fg-muted, #6b7280)',
    marginBottom: 32,
  } as React.CSSProperties,
  section: {
    marginBottom: 28,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--fg-muted, #6b7280)',
    marginBottom: 12,
  } as React.CSSProperties,
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
  fieldGroup: {
    marginBottom: 16,
  } as React.CSSProperties,
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  } as React.CSSProperties,
  providerRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 24,
  } as React.CSSProperties,
  providerBtn: (active: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    border: active ? '2px solid var(--accent, #6366f1)' : '2px solid var(--border, #d1d5db)',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    background: active ? 'var(--accent-bg, #eef2ff)' : 'var(--bg-input, #fff)',
    color: active ? 'var(--accent, #6366f1)' : 'var(--fg-muted, #6b7280)',
    transition: 'all 0.15s',
  }),
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  } as React.CSSProperties,
  checkLabel: {
    fontSize: 13,
    color: 'var(--fg, #111)',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: 12,
    marginTop: 32,
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
    color: 'var(--accent, #6366f1)',
    border: '1.5px solid var(--accent, #6366f1)',
    borderRadius: 7,
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  } as React.CSSProperties,
  statusBox: (kind: 'success' | 'error' | 'info'): React.CSSProperties => ({
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 16,
    background: kind === 'success' ? '#ecfdf5' : kind === 'error' ? '#fef2f2' : '#eff6ff',
    color: kind === 'success' ? '#065f46' : kind === 'error' ? '#991b1b' : '#1e40af',
    border: `1px solid ${kind === 'success' ? '#6ee7b7' : kind === 'error' ? '#fca5a5' : '#93c5fd'}`,
  }),
  hint: {
    fontSize: 12,
    color: 'var(--fg-muted, #6b7280)',
    marginTop: 4,
  } as React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function StorageConfigPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  const [form, setForm] = useState<StorageFormState>(DEFAULT_STATE);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null);

  const updateField = useCallback(<K extends keyof StorageFormState>(key: K, value: StorageFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleAllowedType = useCallback((value: string) => {
    setForm((prev) => ({
      ...prev,
      allowedTypes: prev.allowedTypes.includes(value)
        ? prev.allowedTypes.filter((t) => t !== value)
        : [...prev.allowedTypes, value],
    }));
  }, []);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/integrations/storage/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          bucket: form.bucket,
          region: form.region,
          endpoint: form.endpoint || undefined,
          accessKeyId: form.accessKeyId,
          secretAccessKey: form.secretAccessKey,
        }),
      });
      if (res.ok) {
        setStatus({ kind: 'success', message: 'Connection successful — bucket is accessible.' });
      } else {
        const data = await res.json() as { error?: string };
        setStatus({ kind: 'error', message: data.error ?? 'Connection test failed.' });
      }
    } catch {
      setStatus({ kind: 'error', message: 'Network error — could not reach the test endpoint.' });
    } finally {
      setTesting(false);
    }
  }, [appId, form]);

  const handleSave = useCallback(async () => {
    if (!form.bucket || !form.accessKeyId || !form.secretAccessKey) {
      setStatus({ kind: 'error', message: 'Bucket, Access Key ID, and Secret Key are required.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/integrations/storage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus({ kind: 'success', message: 'Storage configuration saved.' });
      } else {
        const data = await res.json() as { error?: string };
        setStatus({ kind: 'error', message: data.error ?? 'Save failed.' });
      }
    } catch {
      setStatus({ kind: 'error', message: 'Network error — could not save configuration.' });
    } finally {
      setSaving(false);
    }
  }, [appId, form]);

  const isR2 = form.provider === 'r2';

  return (
    <div style={S.page}>
      <h1 style={S.heading}>File Storage</h1>
      <p style={S.sub}>
        Connect an S3-compatible bucket to store file attachments uploaded by users.
        Credentials are encrypted before storage.
      </p>

      {status && <div style={S.statusBox(status.kind)}>{status.message}</div>}

      {/* Provider picker */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Provider</div>
        <div style={S.providerRow}>
          {(['s3', 'r2'] as Provider[]).map((p) => (
            <button
              key={p}
              style={S.providerBtn(form.provider === p)}
              onClick={() => updateField('provider', p)}
            >
              {p === 's3' ? 'Amazon S3' : 'Cloudflare R2'}
            </button>
          ))}
        </div>
      </div>

      {/* Bucket & Region */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Bucket</div>
        <div style={S.grid2}>
          <div style={S.fieldGroup}>
            <label style={S.label}>Bucket name *</label>
            <input
              style={S.input}
              value={form.bucket}
              onChange={(e) => updateField('bucket', e.target.value)}
              placeholder="my-app-uploads"
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>{isR2 ? 'Region (auto for R2)' : 'Region *'}</label>
            <input
              style={S.input}
              value={form.region}
              onChange={(e) => updateField('region', e.target.value)}
              placeholder={isR2 ? 'auto' : 'us-east-1'}
            />
          </div>
        </div>

        {isR2 && (
          <div style={S.fieldGroup}>
            <label style={S.label}>R2 Endpoint</label>
            <input
              style={S.input}
              value={form.endpoint}
              onChange={(e) => updateField('endpoint', e.target.value)}
              placeholder="https://<account-id>.r2.cloudflarestorage.com"
            />
            <div style={S.hint}>Find this in your Cloudflare dashboard under R2 → your bucket → Settings.</div>
          </div>
        )}

        <div style={S.fieldGroup}>
          <label style={S.label}>Public base URL (optional)</label>
          <input
            style={S.input}
            value={form.publicBaseUrl}
            onChange={(e) => updateField('publicBaseUrl', e.target.value)}
            placeholder="https://cdn.example.com"
          />
          <div style={S.hint}>For public buckets: file links will use this URL instead of a signed URL.</div>
        </div>
      </div>

      {/* Credentials */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Credentials</div>
        <div style={S.fieldGroup}>
          <label style={S.label}>Access Key ID *</label>
          <input
            style={S.input}
            value={form.accessKeyId}
            onChange={(e) => updateField('accessKeyId', e.target.value)}
            placeholder="AKIAIOSFODNN7EXAMPLE"
            autoComplete="off"
          />
        </div>
        <div style={S.fieldGroup}>
          <label style={S.label}>Secret Access Key *</label>
          <input
            style={S.input}
            type="password"
            value={form.secretAccessKey}
            onChange={(e) => updateField('secretAccessKey', e.target.value)}
            placeholder="••••••••••••••••••••••••••••••••"
            autoComplete="new-password"
          />
        </div>
      </div>

      {/* Allowed file types */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Allowed file types</div>
        {FILE_TYPE_OPTIONS.map((opt) => (
          <div key={opt.value} style={S.checkRow}>
            <input
              id={`ft-${opt.value}`}
              type="checkbox"
              checked={form.allowedTypes.includes(opt.value)}
              onChange={() => toggleAllowedType(opt.value)}
            />
            <label htmlFor={`ft-${opt.value}`} style={S.checkLabel}>{opt.label}</label>
          </div>
        ))}
      </div>

      {/* Max file size */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Limits</div>
        <div style={{ ...S.fieldGroup, maxWidth: 220 }}>
          <label style={S.label}>Max file size (MB)</label>
          <input
            style={S.input}
            type="number"
            min={1}
            max={500}
            value={form.maxSizeMb}
            onChange={(e) => updateField('maxSizeMb', Number(e.target.value))}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={S.actions}>
        <button
          style={S.primaryBtn(saving)}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save configuration'}
        </button>
        <button
          style={S.secondaryBtn}
          onClick={handleTest}
          disabled={testing || !form.bucket || !form.accessKeyId || !form.secretAccessKey}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
    </div>
  );
}
