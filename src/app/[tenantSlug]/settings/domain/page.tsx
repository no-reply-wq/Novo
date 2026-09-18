'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/TenantLayout';
import { Button, Input, Badge, Card, Toast } from '@/components/ui';
import { Globe, CheckCircle, Clock, AlertCircle, Copy, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';

interface DomainStatus {
  customDomain: string | null;
  domainVerified: boolean;
  slug: string;
}

export default function CustomDomainPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  async function load() {
    const d = await fetch(`/api/tenant/domain?tenant=${tenantSlug}`).then(r => r.json());
    setStatus(d);
    setDomain(d.customDomain ?? '');
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveDomain() {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenant/domain?tenant=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      if (res.ok) {
        setToast({ message: 'Domain saved. Add the DNS records below then click Verify.', type: 'success' });
        load();
      } else {
        const err = await res.json();
        setToast({ message: err.error ?? 'Failed to save', type: 'error' });
      }
    } finally {
      setSaving(false);
    }
  }

  async function verify() {
    setVerifying(true);
    try {
      const res = await fetch(`/api/tenant/domain/verify?tenant=${tenantSlug}`, { method: 'POST' });
      const d = await res.json();
      if (d.verified) {
        setToast({ message: 'Domain verified! Your custom domain is now active.', type: 'success' });
      } else {
        setToast({ message: 'DNS records not found yet. DNS changes can take up to 48 hours to propagate.', type: 'error' });
      }
      load();
    } finally {
      setVerifying(false);
    }
  }

  async function removeDomain() {
    await fetch(`/api/tenant/domain?tenant=${tenantSlug}`, { method: 'DELETE' });
    setToast({ message: 'Custom domain removed', type: 'success' });
    setDomain('');
    load();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setToast({ message: 'Copied to clipboard', type: 'success' });
  }

  const baseDomain = process.env.NEXT_PUBLIC_BASE_URL?.replace('https://', '') ?? 'lrbc-erp.com';
  const verificationToken = `lrbc-verify=${tenantSlug}`;

  return (
    <>
      <PageHeader
        title="Custom domain"
        description="Use your own domain instead of the default subdomain"
        breadcrumb={[{ label: 'Settings', href: `/${tenantSlug}/settings` }, { label: 'Custom domain' }]}
      />

      <div className="p-6 max-w-2xl space-y-6">
        {/* Current URL */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Globe className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Current URLs</p>
              <p className="text-xs text-slate-500">Your ERP is accessible at these addresses</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-xs text-slate-500 w-20 flex-shrink-0">Default</span>
              <code className="text-sm text-slate-700 flex-1">{tenantSlug}.{baseDomain}</code>
              <Badge variant="success">Active</Badge>
            </div>
            {status?.customDomain && (
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-500 w-20 flex-shrink-0">Custom</span>
                <code className="text-sm text-slate-700 flex-1">{status.customDomain}</code>
                {status.domainVerified
                  ? <Badge variant="success">Verified</Badge>
                  : <Badge variant="warning">Pending DNS</Badge>}
              </div>
            )}
          </div>
        </Card>

        {/* Domain input */}
        <Card>
          <h3 className="text-sm font-semibold text-slate-800 mb-4">
            {status?.customDomain ? 'Change custom domain' : 'Add custom domain'}
          </h3>
          <div className="flex gap-3">
            <Input
              value={domain}
              onChange={e => setDomain(e.target.value.toLowerCase().trim())}
              placeholder="erp.yourcompany.com"
              hint="Enter just the domain — no https:// prefix"
              className="flex-1"
            />
            <Button loading={saving} onClick={saveDomain} disabled={!domain || domain === status?.customDomain}>
              Save
            </Button>
          </div>
          {status?.customDomain && (
            <button onClick={removeDomain} className="text-xs text-red-500 hover:text-red-700 mt-2">
              Remove custom domain
            </button>
          )}
        </Card>

        {/* DNS instructions */}
        {status?.customDomain && !status.domainVerified && (
          <Card>
            <div className="flex items-start gap-3 mb-5">
              <Clock className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-800">DNS verification required</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add these DNS records at your domain registrar, then click Verify.
                  DNS changes can take up to 48 hours.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* CNAME record */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  1. CNAME record — points your domain to LRBC ERP
                </p>
                <div className="bg-slate-900 rounded-lg p-4 text-sm font-mono">
                  <div className="grid grid-cols-3 gap-4 text-slate-400 text-xs mb-2">
                    <span>Type</span><span>Name</span><span>Value</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-green-400">
                    <span>CNAME</span>
                    <span>{status.customDomain.split('.')[0]}</span>
                    <span className="flex items-center gap-1">
                      {tenantSlug}.{baseDomain}
                      <button onClick={() => copyToClipboard(`${tenantSlug}.${baseDomain}`)} className="text-slate-500 hover:text-white ml-1">
                        <Copy className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                </div>
              </div>

              {/* TXT verification record */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  2. TXT record — proves you own this domain
                </p>
                <div className="bg-slate-900 rounded-lg p-4 text-sm font-mono">
                  <div className="grid grid-cols-3 gap-4 text-slate-400 text-xs mb-2">
                    <span>Type</span><span>Name</span><span>Value</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-green-400">
                    <span>TXT</span>
                    <span>@</span>
                    <span className="flex items-center gap-1 break-all">
                      {verificationToken}
                      <button onClick={() => copyToClipboard(verificationToken)} className="text-slate-500 hover:text-white ml-1 flex-shrink-0">
                        <Copy className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <Button
              className="mt-4 w-full"
              variant="secondary"
              loading={verifying}
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={verify}
            >
              Verify DNS records
            </Button>
          </Card>
        )}

        {/* Verified state */}
        {status?.customDomain && status.domainVerified && (
          <Card>
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Custom domain active</p>
                <p className="text-xs text-slate-500">
                  Your ERP is live at <strong>{status.customDomain}</strong>.
                  The default subdomain continues to work as well.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </>
  );
}
