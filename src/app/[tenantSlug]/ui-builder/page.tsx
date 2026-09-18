'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PageBuilderEditor } from '@/components/page-builder/PageBuilderEditor';
import { PageLayoutConfig, emptyLayout } from '@/lib/page-builder/types';

export default function UIBuilderPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<Array<{ key: string; label: string }>>([]);
  const [selectedPage, setSelectedPage] = useState('dashboard');
  const [layout, setLayout] = useState<PageLayoutConfig | null>(null);
  const [forms, setForms] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [pagesRes, formsRes] = await Promise.all([
          fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&resource=pages`).then(r => r.json()),
          fetch(`/api/tenant/form-builder?tenant=${tenantSlug}`).then(r => r.json()),
        ]);
        setPages(pagesRes.pages ?? []);
        setForms(formsRes.forms ?? []);
        try {
          const sourcesRes = await fetch(`/api/tenant/form-builder/available-sources?tenant=${tenantSlug}`).then(r => r.json());
          setTables((sourcesRes.sources ?? []).filter((s: { value: string }) => !s.value.startsWith('form:')).map((s: { value: string }) => s.value));
        } catch {}
      } finally { setLoading(false); }
    }
    init();
  }, [tenantSlug]);

  useEffect(() => {
    async function loadLayout() {
      try {
        const res = await fetch(`/api/tenant/ui-builder/layout?tenant=${tenantSlug}&pageKey=${selectedPage}`);
        if (res.ok) { const d = await res.json(); if (d.layout?.rootIds) { setLayout(d.layout); return; } }
      } catch {}
      setLayout(emptyLayout(selectedPage));
    }
    loadLayout();
  }, [selectedPage, tenantSlug]);

  async function handleSave(newLayout: PageLayoutConfig) {
    const res = await fetch(`/api/tenant/ui-builder/layout?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageKey: selectedPage, layout: newLayout }),
    });
    const type = res.ok ? 'success' : 'error';
    setToast({ message: res.ok ? 'Page saved' : 'Save failed', type });
    setTimeout(() => setToast(null), 3000);
  }

  if (loading || !layout) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6b7280' }}>Loading builder...</div>;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'fixed', top: 0, left: '240px', right: 0, height: '40px', backgroundColor: '#0f172a', zIndex: 100, display: 'flex', alignItems: 'center', paddingLeft: '16px', gap: '8px', borderBottom: '1px solid #1e293b' }}>
        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>PAGE:</span>
        <select value={selectedPage} onChange={e => setSelectedPage(e.target.value)} style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '12px', padding: '4px 8px', cursor: 'pointer' }}>
          {pages.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      <div style={{ paddingTop: '40px' }}>
        <PageBuilderEditor tenantSlug={tenantSlug} initialLayout={layout} forms={forms} tables={tables} onSave={handleSave} />
      </div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444', color: '#fff', padding: '12px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '500' }}>{toast.message}</div>}
    </div>
  );
}
