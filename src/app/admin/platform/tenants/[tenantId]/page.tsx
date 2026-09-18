'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Badge, Card, Toast } from '@/components/ui';
import { ArrowLeft, ExternalLink, LogIn, Save, Settings, Layers, Users, Globe, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ALL_MODULES, ALL_FEATURES } from '@/lib/features';

interface TenantDetail {
  id: string; name: string; slug: string; plan: string; seatLimit: number;
  status: string; primaryColor: string | null; schemaName: string;
  createdAt: string; hiddenModules: string[]; allowedFeatures: string[];
}

export default function TenantDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [allowedFeatures, setAllowedFeatures] = useState<string[]>([]);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [plan, setPlan] = useState('starter');
  const [seatLimit, setSeatLimit] = useState(5);
  const [status, setStatus] = useState('ACTIVE');

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/platform/tenants/${tenantId}`);
      const d = await r.json();
      const t = d.tenant as TenantDetail;
      setTenant(t);
      setAllowedFeatures(t.allowedFeatures ?? []);
      setHiddenModules(t.hiddenModules ?? []);
      setPlan(t.plan);
      setSeatLimit(t.seatLimit);
      setStatus(t.status);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [tenantId]);

  function toggleFeature(key: string) {
    setAllowedFeatures(prev => {
      if (prev.length === 0) {
        const allKeys = [...ALL_MODULES, ...ALL_FEATURES].map(f => f.key);
        return allKeys.filter(k => k !== key);
      }
      if (prev.includes(key)) return prev.filter(k => k !== key);
      return [...prev, key];
    });
  }

  function toggleModule(key: string) {
    setHiddenModules(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function isFeatureAllowed(key: string) { return allowedFeatures.length === 0 || allowedFeatures.includes(key); }
  function isModuleVisible(key: string) { return !hiddenModules.includes(key); }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/platform/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedFeatures, hiddenModules, plan, seatLimit, status }),
      });
      if (!r.ok) throw new Error('Save failed');
      setToast({ message: 'Tenant settings saved', type: 'success' });
      load();
    } catch { setToast({ message: 'Failed to save', type: 'error' }); }
    finally { setSaving(false); }
  }

  async function impersonate() {
    setImpersonating(true);
    try {
      const r = await fetch(`/api/platform/tenants/${tenantId}/impersonate`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      window.open(d.loginUrl, '_blank');
      setToast({ message: `Login link opened for ${d.tenant}. Expires in 15 min.`, type: 'success' });
    } catch (e) { setToast({ message: e instanceof Error ? e.message : 'Failed', type: 'error' }); }
    finally { setImpersonating(false); }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading...</div>;
  if (!tenant) return <div className="p-8 text-red-500">Tenant not found</div>;

  const tenantUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${tenant.slug}`;

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{tenant.name}</h1>
          <p className="text-sm text-slate-500">{tenant.slug} · {tenant.schemaName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={tenant.status === 'ACTIVE' ? 'success' : tenant.status === 'SUSPENDED' ? 'danger' : 'warning'}>
            {tenant.status}
          </Badge>
          <a href={`${tenantUrl}/dashboard`} target="_blank" rel="noopener"
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Open tenant
          </a>
          <Button icon={<LogIn className="w-4 h-4" />} loading={impersonating} onClick={impersonate}>
            Login as admin
          </Button>
        </div>
      </div>

      <Card>
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4 text-indigo-600" /> Manage on behalf of {tenant.name}
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Form Builder', href: `${tenantUrl}/form-builder` },
            { label: 'UI Builder', href: `${tenantUrl}/ui-builder` },
            { label: 'Integrations', href: `${tenantUrl}/settings/integrations` },
            { label: 'Masters', href: `${tenantUrl}/masters` },
            { label: 'Users & Roles', href: `${tenantUrl}/settings` },
            { label: 'Branding', href: `${tenantUrl}/settings/branding` },
          ].map(({ label, href }) => (
            <a key={label} href={href} target="_blank" rel="noopener"
              className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> {label}
            </a>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-600" /> Plan & Status
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Plan</label>
              <select value={plan} onChange={e => setPlan(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-indigo-400">
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Seat Limit</label>
              <input type="number" value={seatLimit} onChange={e => setSeatLimit(Number(e.target.value))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-indigo-400">
                <option value="ACTIVE">Active</option>
                <option value="TRIAL">Trial</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" /> Platform Features
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            {allowedFeatures.length === 0 ? 'All features enabled (unrestricted)' : `${allowedFeatures.length} feature(s) enabled`}
          </p>
          <div className="space-y-2">
            {ALL_FEATURES.map(f => (
              <label key={f.key} className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input type="checkbox" checked={isFeatureAllowed(f.key)} onChange={() => toggleFeature(f.key)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{f.label}</p>
                  <p className="text-xs text-slate-400">{f.description}</p>
                </div>
                {isFeatureAllowed(f.key)
                  ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-slate-300 flex-shrink-0" />}
              </label>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" /> Module Visibility
        </h3>
        <p className="text-xs text-slate-400 mb-4">Control which sidebar modules this client can see. Hiding does not delete data.</p>
        <div className="grid grid-cols-3 gap-3">
          {ALL_MODULES.map(m => (
            <label key={m.key}
              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${isModuleVisible(m.key) ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
              <input type="checkbox" checked={isModuleVisible(m.key)} onChange={() => toggleModule(m.key)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
              <div>
                <p className="text-sm font-medium text-slate-700">{m.label}</p>
                <p className="text-xs text-slate-400 leading-tight">{m.description}</p>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button icon={<Save className="w-4 h-4" />} loading={saving} onClick={save}>Save changes</Button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}
