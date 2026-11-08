'use client';

import React, { useState, useEffect } from 'react';
import type { WhitelabelConfig } from '@/platform/whitelabel/types';

export default function WhitelabelPage() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [config, setConfig] = useState<WhitelabelConfig>({ tenantSlug: '', hideNovoBranding: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('tenant') ?? '';
    setTenantSlug(slug);
    if (!slug) { setLoading(false); return; }
    fetch(`/api/builder/tenant/whitelabel?tenantSlug=${encodeURIComponent(slug)}`)
      .then((r) => r.json()).then((d: WhitelabelConfig) => { setConfig(d); setLoading(false); })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : String(e)); setLoading(false); });
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(null); setSuccess(false);
    try {
      const res = await fetch('/api/builder/tenant/whitelabel', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, tenantSlug }),
      });
      if (!res.ok) { const d = (await res.json()) as { error?: string }; throw new Error(d.error ?? `HTTP ${res.status}`); }
      setSuccess(true); setTimeout(() => setSuccess(false), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const set = <K extends keyof WhitelabelConfig>(key: K, value: WhitelabelConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  if (loading) return <div className="flex items-center justify-center h-64 text-sm text-[var(--muted)]">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--fg)]">White-label Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Customise branding, domain and appearance for your ERP.</p>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">Settings saved.</div>}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--fg)]">Branding</h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">Company name</span>
          <input type="text" value={config.companyName ?? ''} onChange={(e) => set('companyName', e.target.value)}
            placeholder="Acme Corp" className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm text-[var(--fg)]" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">Logo URL</span>
          <input type="url" value={config.logoUrl ?? ''} onChange={(e) => set('logoUrl', e.target.value)}
            placeholder="https://cdn.example.com/logo.png" className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm text-[var(--fg)]" />
          {config.logoUrl && <img src={config.logoUrl} alt="Logo preview" className="mt-1 h-10 object-contain" />}
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">Favicon URL</span>
          <input type="url" value={config.faviconUrl ?? ''} onChange={(e) => set('faviconUrl', e.target.value)}
            placeholder="https://cdn.example.com/favicon.ico" className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm text-[var(--fg)]" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">Primary colour</span>
          <div className="flex items-center gap-2">
            <input type="color" value={config.primaryColor || '#6366f1'} onChange={(e) => set('primaryColor', e.target.value)}
              className="h-8 w-10 rounded border border-[var(--border)] cursor-pointer p-0.5" />
            <input type="text" value={config.primaryColor ?? ''} onChange={(e) => set('primaryColor', e.target.value)}
              placeholder="#6366f1" className="flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm text-[var(--fg)] font-mono" />
          </div>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={config.hideNovoBranding} onChange={(e) => set('hideNovoBranding', e.target.checked)} className="h-4 w-4 rounded" />
          <span className="text-sm text-[var(--fg)]">Hide &ldquo;Powered by Novo&rdquo; branding</span>
        </label>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--fg)]">Custom domain</h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">Domain</span>
          <input type="text" value={config.customDomain ?? ''} onChange={(e) => set('customDomain', e.target.value)}
            placeholder="erp.mycompany.com" className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm text-[var(--fg)] font-mono" />
        </label>
        {config.customDomain && (
          <div className="rounded bg-[var(--surface-hover)] p-3 text-xs font-mono space-y-1">
            <div className="font-sans font-semibold text-[var(--fg)] text-xs mb-1">DNS instructions</div>
            <div>Add a CNAME record:</div>
            <div className="pl-2"><span className="text-blue-500">{config.customDomain}</span> CNAME <span className="text-green-500">novo.app</span></div>
            <div className="text-[var(--muted)]">TTL: 3600</div>
          </div>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--muted)]">Support email</span>
          <input type="email" value={config.supportEmail ?? ''} onChange={(e) => set('supportEmail', e.target.value)}
            placeholder="support@mycompany.com" className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm text-[var(--fg)]" />
        </label>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--fg)]">Custom CSS</h2>
        <p className="text-xs text-[var(--muted)]">Injected into &lt;head&gt; on every page.</p>
        <textarea value={config.customCss ?? ''} onChange={(e) => set('customCss', e.target.value)}
          rows={8} spellCheck={false} placeholder=":root { --primary: #6366f1; }"
          className="w-full rounded border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--fg)] font-mono resize-y" />
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--fg)]">Preview</h2>
          <button onClick={() => setPreviewOpen((v) => !v)} className="text-xs px-3 py-1 rounded border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--surface-hover)]">
            {previewOpen ? 'Hide' : 'Show'} preview
          </button>
        </div>
        {previewOpen && (
          <div className="rounded border border-[var(--border)] p-4 space-y-2">
            {config.logoUrl && <img src={config.logoUrl} alt="Logo" className="h-8 object-contain" />}
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded" style={{ background: config.primaryColor ?? '#6366f1' }} />
              <span className="text-sm font-semibold text-[var(--fg)]">{config.companyName || 'Your Company'}</span>
            </div>
            {!config.hideNovoBranding && <div className="text-xs text-[var(--muted)]">Powered by Novo</div>}
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <button onClick={() => void handleSave()} disabled={saving}
          className="px-5 py-2 rounded bg-indigo-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
