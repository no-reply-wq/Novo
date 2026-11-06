'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SecretEntry {
  key: string;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  container: { maxWidth: 720, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' } as React.CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#111' } as React.CSSProperties,
  subtitle: { fontSize: 14, color: '#666', marginBottom: 32, lineHeight: 1.5 } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginBottom: 24 } as React.CSSProperties,
  h2: { fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#111' } as React.CSSProperties,
  form: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  row: { display: 'flex', gap: 12, alignItems: 'flex-start' } as React.CSSProperties,
  label: { fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' } as React.CSSProperties,
  input: {
    width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid #d1d5db',
    borderRadius: 6, outline: 'none', boxSizing: 'border-box' as const,
  },
  btnPrimary: {
    padding: '8px 16px', fontSize: 14, fontWeight: 600,
    background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnDanger: {
    padding: '6px 12px', fontSize: 13, background: 'transparent',
    color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer',
  },
  keyRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0', borderBottom: '1px solid #f3f4f6',
  },
  keyLabel: { fontFamily: 'monospace', fontSize: 14, color: '#374151' },
  keyMask: { fontSize: 12, color: '#9ca3af', marginLeft: 8 },
  emptyState: { color: '#9ca3af', fontSize: 14, textAlign: 'center' as const, padding: '24px 0' },
  error: { fontSize: 13, color: '#dc2626', marginTop: 4 },
  success: { fontSize: 13, color: '#16a34a', marginTop: 4 },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SecretsPage() {
  const { appId } = useParams<{ appId: string }>();
  const [keys, setKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [valueVisible, setValueVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/secrets`);
      if (!res.ok) throw new Error('Failed to load secrets');
      const data = (await res.json()) as { keys: string[] };
      setKeys(data.keys);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => { void fetchKeys(); }, [fetchKeys]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) {
      setMessage({ type: 'error', text: 'Both key and value are required' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), value: newValue, tenantSlug: appId }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Failed to save secret');
      }
      setNewKey('');
      setNewValue('');
      setValueVisible(false);
      setMessage({ type: 'success', text: `Secret "${newKey.trim()}" saved.` });
      await fetchKeys();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete secret "${key}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/builder/apps/${appId}/secrets?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete secret');
      setMessage({ type: 'success', text: `Secret "${key}" deleted.` });
      await fetchKeys();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete' });
    }
  };

  return (
    <div style={S.container}>
      <h1 style={S.h1}>Secrets</h1>
      <p style={S.subtitle}>
        Store sensitive values like API keys and passwords. Values are encrypted with AES-256-GCM
        and can only be retrieved inside a script via <code>sdk.secrets.get(&quot;key&quot;)</code>.
        Values are never shown after saving.
      </p>

      {/* Add secret */}
      <div style={S.card}>
        <h2 style={S.h2}>Add Secret</h2>
        <form onSubmit={(e) => { void handleAdd(e); }} style={S.form}>
          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Key</label>
              <input
                style={S.input}
                type="text"
                placeholder="e.g. STRIPE_API_KEY"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div style={{ flex: 2 }}>
              <label style={S.label}>Value</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={S.input}
                  type={valueVisible ? 'text' : 'password'}
                  placeholder="Paste secret value…"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setValueVisible((v) => !v)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b7280',
                  }}
                >
                  {valueVisible ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>
          {message && (
            <div style={message.type === 'error' ? S.error : S.success}>{message.text}</div>
          )}
          <div>
            <button type="submit" style={S.btnPrimary} disabled={saving}>
              {saving ? 'Saving…' : 'Save Secret'}
            </button>
          </div>
        </form>
      </div>

      {/* Secret list */}
      <div style={S.card}>
        <h2 style={S.h2}>Stored Secrets</h2>
        {loading ? (
          <div style={S.emptyState}>Loading…</div>
        ) : keys.length === 0 ? (
          <div style={S.emptyState}>No secrets stored yet.</div>
        ) : (
          <div>
            {keys.map((key) => (
              <div key={key} style={S.keyRow}>
                <span>
                  <span style={S.keyLabel}>{key}</span>
                  <span style={S.keyMask}>••••••••</span>
                </span>
                <button style={S.btnDanger} onClick={() => { void handleDelete(key); }}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
