'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { AppVersion } from '@/platform/packaging/types';

const S = {
  container: { maxWidth: 900, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, margin: 0 },
  btn: { padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  btnPrimary: { background: '#2563eb', color: '#fff' },
  btnSecondary: { background: '#e5e7eb', color: '#374151' },
  btnDanger: { background: '#dc2626', color: '#fff' },
  btnSmall: { padding: '4px 10px', fontSize: 12 },
  card: { background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 12, padding: '16px 20px' },
  row: { display: 'flex', alignItems: 'center', gap: 12 },
  badge: (status: string) => ({
    padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
    background: status === 'published' ? '#d1fae5' : status === 'preview' ? '#fef3c7' : status === 'draft' ? '#eff6ff' : '#f3f4f6',
    color: status === 'published' ? '#065f46' : status === 'preview' ? '#92400e' : status === 'draft' ? '#1e40af' : '#6b7280',
  }),
  form: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginTop: 24 },
  input: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%', boxSizing: 'border-box' as const },
  toast: (ok: boolean) => ({
    position: 'fixed' as const, bottom: 24, right: 24, padding: '12px 20px', borderRadius: 8,
    background: ok ? '#065f46' : '#7f1d1d', color: '#fff', fontSize: 14, zIndex: 9999,
  }),
};

export default function VersionsPage() {
  const { appId } = useParams<{ appId: string }>();
  const router = useRouter();
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [versionLabel, setVersionLabel] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [creating, setCreating] = useState(false);

  const tenant = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tenant') ?? '' : '';

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function fetchVersions() {
    setLoading(true);
    const res = await fetch(`/api/builder/apps/${appId}/versions?tenant=${tenant}`);
    const data = await res.json() as { versions?: AppVersion[] };
    setVersions(data.versions ?? []);
    setLoading(false);
  }

  useEffect(() => { void fetchVersions(); }, [appId]);

  async function createDraft() {
    if (!versionLabel.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/builder/apps/${appId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant, versionLabel }),
    });
    setCreating(false);
    if (res.ok) {
      showToast('Draft created');
      setVersionLabel('');
      void fetchVersions();
    } else {
      const d = await res.json() as { error?: string };
      showToast(d.error ?? 'Failed', false);
    }
  }

  async function promote(versionId: string, action: 'preview' | 'publish' | 'rollback') {
    const res = await fetch(`/api/builder/apps/${appId}/versions/${versionId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant }),
    });
    if (res.ok) {
      showToast(action === 'rollback' ? 'Rolled back' : action === 'publish' ? 'Published!' : 'Preview set');
      void fetchVersions();
    } else {
      const d = await res.json() as { error?: string };
      showToast(d.error ?? 'Failed', false);
    }
  }

  async function downloadExport() {
    const res = await fetch(`/api/builder/apps/${appId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant }),
    });
    if (!res.ok) { showToast('Export failed', false); return; }
    const blob = await res.blob();
    const disp = res.headers.get('Content-Disposition') ?? '';
    const match = disp.match(/filename="(.+)"/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = match?.[1] ?? 'bundle.json';
    a.click();
    showToast('Downloaded');
  }

  return (
    <div style={S.container}>
      <div style={S.header}>
        <h1 style={S.title}>App Versions</h1>
        <button style={{ ...S.btn, ...S.btnSecondary }} onClick={downloadExport}>Export Bundle</button>
      </div>

      {loading ? <p>Loading…</p> : versions.length === 0 ? <p style={{ color: '#6b7280' }}>No versions yet.</p> : (
        versions.map(v => (
          <div key={v.id} style={S.card}>
            <div style={{ ...S.row, justifyContent: 'space-between' }}>
              <div style={S.row}>
                <strong>{v.version}</strong>
                <span style={S.badge(v.status)}>{v.status}</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{new Date(v.createdAt).toLocaleString()}</span>
                {v.rollbackFrom && <span style={{ fontSize: 11, color: '#9ca3af' }}>rolled back</span>}
              </div>
              <div style={S.row}>
                {v.status === 'draft' && (
                  <>
                    <button style={{ ...S.btn, ...S.btnSecondary, ...S.btnSmall }} onClick={() => promote(v.id, 'preview')}>Preview</button>
                    <button style={{ ...S.btn, ...S.btnPrimary, ...S.btnSmall }} onClick={() => promote(v.id, 'publish')}>Publish</button>
                  </>
                )}
                {v.status === 'preview' && (
                  <button style={{ ...S.btn, ...S.btnPrimary, ...S.btnSmall }} onClick={() => promote(v.id, 'publish')}>Go Live</button>
                )}
                {(v.status === 'archived' || v.status === 'published') && v.status !== 'published' && (
                  <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSmall }} onClick={() => promote(v.id, 'rollback')}>Rollback</button>
                )}
                {v.status === 'archived' && (
                  <button style={{ ...S.btn, ...S.btnDanger, ...S.btnSmall }} onClick={() => promote(v.id, 'rollback')}>Rollback to this</button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      <div style={S.form}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Create New Draft</h3>
        <input
          style={S.input}
          placeholder="Version label (e.g. v1.2 or sprint-42)"
          value={versionLabel}
          onChange={e => setVersionLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void createDraft()}
        />
        <button
          style={{ ...S.btn, ...S.btnPrimary, marginTop: 12 }}
          onClick={() => void createDraft()}
          disabled={creating || !versionLabel.trim()}
        >
          {creating ? 'Creating…' : 'Create Draft'}
        </button>
      </div>

      {toast && <div style={S.toast(toast.ok)}>{toast.msg}</div>}
    </div>
  );
}
