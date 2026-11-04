'use client';

import { useState, useEffect, useRef } from 'react';
import { PageHeader } from '@/components/layout/TenantLayout';
import { Button, Input, Card, Toast } from '@/components/ui';
import { Upload, Palette, Building2, Check } from 'lucide-react';
import { useParams } from 'next/navigation';

interface BrandingData {
  tenantName: string;
  primaryColor: string;
  logoUrl: string | null;
}

const PRESET_COLORS = [
  '#6366f1', // Indigo (default)
  '#0ea5e9', // Sky
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#64748b', // Slate
];

export default function BrandingPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [data, setData] = useState<BrandingData>({ tenantName: '', primaryColor: '#6366f1', logoUrl: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const d = await fetch(`/api/tenant/branding?tenant=${tenantSlug}`).then(r => r.json());
    setData({ tenantName: d.name ?? '', primaryColor: d.primaryColor ?? '#6366f1', logoUrl: d.logoUrl ?? null });
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenant/branding?tenant=${tenantSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryColor: data.primaryColor, name: data.tenantName }),
      });
      if (res.ok) {
        setToast({ message: 'Branding saved — reload to see sidebar colour change', type: 'success' });
      } else {
        setToast({ message: 'Failed to save', type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/tenant/branding/logo?tenant=${tenantSlug}`, { method: 'POST', body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setData(prev => ({ ...prev, logoUrl: url }));
        setToast({ message: 'Logo uploaded', type: 'success' });
      } else {
        setToast({ message: 'Logo upload failed', type: 'error' });
      }
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    await fetch(`/api/tenant/branding/logo?tenant=${tenantSlug}`, { method: 'DELETE' });
    setData(prev => ({ ...prev, logoUrl: null }));
    setToast({ message: 'Logo removed', type: 'success' });
  }

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading…</div>;

  return (
    <>
      <PageHeader
        title="Branding"
        description="Customise how your ERP looks for your team"
        breadcrumb={[{ label: 'Settings', href: `/${tenantSlug}/settings` }, { label: 'Branding' }]}
        actions={<Button loading={saving} onClick={save}>Save changes</Button>}
      />

      <div className="p-6 max-w-2xl space-y-6">
        {/* Company name */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
              <Building2 className="w-4 h-4 text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Company name</h3>
          </div>
          <Input
            label="Display name"
            value={data.tenantName}
            onChange={e => setData(prev => ({ ...prev, tenantName: e.target.value }))}
            hint="Shown in the sidebar header and on documents"
          />
        </Card>

        {/* Logo */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
              <Upload className="w-4 h-4 text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Company logo</h3>
          </div>

          {data.logoUrl ? (
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.logoUrl} alt="Company logo" className="w-full h-full object-contain p-2" />
              </div>
              <div className="space-y-2">
                <Button size="sm" variant="secondary" icon={<Upload className="w-3.5 h-3.5" />}
                  onClick={() => fileRef.current?.click()} loading={uploading}>
                  Replace logo
                </Button>
                <button onClick={removeLogo} className="block text-xs text-red-500 hover:text-red-700">
                  Remove logo
                </button>
              </div>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 cursor-pointer hover:border-indigo-400 transition-colors">
              <Upload className="w-8 h-8 text-slate-300 mb-2" />
              <span className="text-sm text-slate-500">Click to upload logo</span>
              <span className="text-xs text-slate-400 mt-1">PNG, SVG or WebP · Max 2MB · Recommended 200×200px</span>
              <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
            </label>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
        </Card>

        {/* Brand colour */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${data.primaryColor}20` }}>
              <Palette className="w-4 h-4" style={{ color: data.primaryColor }} />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Brand colour</h3>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                onClick={() => setData(prev => ({ ...prev, primaryColor: color }))}
                className="w-9 h-9 rounded-xl border-2 transition-all flex items-center justify-center"
                style={{
                  backgroundColor: color,
                  borderColor: data.primaryColor === color ? '#1e293b' : 'transparent',
                  transform: data.primaryColor === color ? 'scale(1.15)' : 'scale(1)',
                }}
                title={color}
              >
                {data.primaryColor === color && <Check className="w-4 h-4 text-white" />}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl border border-slate-200 overflow-hidden">
              <input type="color" value={data.primaryColor}
                onChange={e => setData(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="w-full h-full cursor-pointer border-0 p-0" />
            </div>
            <Input
              value={data.primaryColor}
              onChange={e => setData(prev => ({ ...prev, primaryColor: e.target.value }))}
              placeholder="#6366f1"
              className="font-mono w-32"
            />
            <div className="flex-1 h-10 rounded-xl border border-slate-200 flex items-center px-4"
              style={{ backgroundColor: `${data.primaryColor}15` }}>
              <span className="text-sm font-medium" style={{ color: data.primaryColor }}>
                Sidebar preview
              </span>
            </div>
          </div>
        </Card>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
