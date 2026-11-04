'use client';

import { useState } from 'react';

interface Integration {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
}

interface Props {
  tenantSlug: string;
  initialIntegrations: Integration[];
}

type IntegrationType = 'webhook' | 'smtp' | 'slack' | 'whatsapp' | 'api';

const TYPE_OPTIONS: { value: IntegrationType; label: string }[] = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'smtp', label: 'SMTP Email' },
  { value: 'slack', label: 'Slack' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'api', label: 'API' },
];

function ConfigFields({ type, config, onChange }: {
  type: IntegrationType;
  config: Record<string, string>;
  onChange: (key: string, value: string | boolean) => void;
}) {
  if (type === 'smtp') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="smtp.example.com" value={config.host ?? ''} onChange={e => onChange('host', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="587" value={config.port ?? ''} onChange={e => onChange('port', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input className="w-full border rounded px-3 py-2 text-sm" value={config.user ?? ''} onChange={e => onChange('user', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" className="w-full border rounded px-3 py-2 text-sm" value={config.pass ?? ''} onChange={e => onChange('pass', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="no-reply@example.com" value={config.from ?? ''} onChange={e => onChange('from', e.target.value)} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.secure === 'true'} onChange={e => onChange('secure', String(e.target.checked))} />
              Use TLS (secure)
            </label>
          </div>
        </div>
      </>
    );
  }
  if (type === 'webhook') {
    return (
      <>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="https://..." value={config.url ?? ''} onChange={e => onChange('url', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Secret (optional)</label>
          <input className="w-full border rounded px-3 py-2 text-sm" value={config.secret ?? ''} onChange={e => onChange('secret', e.target.value)} />
        </div>
      </>
    );
  }
  if (type === 'slack') {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Slack Webhook URL</label>
        <input className="w-full border rounded px-3 py-2 text-sm" placeholder="https://hooks.slack.com/..." value={config.webhook_url ?? ''} onChange={e => onChange('webhook_url', e.target.value)} />
      </div>
    );
  }
  if (type === 'whatsapp') {
    return (
      <>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <input className="w-full border rounded px-3 py-2 text-sm" value={config.api_key ?? ''} onChange={e => onChange('api_key', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID</label>
          <input className="w-full border rounded px-3 py-2 text-sm" value={config.phone_number_id ?? ''} onChange={e => onChange('phone_number_id', e.target.value)} />
        </div>
      </>
    );
  }
  if (type === 'api') {
    return (
      <>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
          <input className="w-full border rounded px-3 py-2 text-sm" placeholder="https://api.example.com" value={config.base_url ?? ''} onChange={e => onChange('base_url', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
          <input className="w-full border rounded px-3 py-2 text-sm" value={config.api_key ?? ''} onChange={e => onChange('api_key', e.target.value)} />
        </div>
      </>
    );
  }
  return null;
}

export default function IntegrationForm({ tenantSlug, initialIntegrations }: Props) {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<IntegrationType>('webhook');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  function handleConfigChange(key: string, value: string | boolean) {
    setConfig(prev => ({ ...prev, [key]: String(value) }));
  }

  function resetForm() {
    setName('');
    setType('webhook');
    setConfig({});
    setError('');
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/tenant/integrations?tenant=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, config, is_active: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save integration');
        return;
      }
      const created = await res.json();
      setIntegrations(prev => [{ ...created, config }, ...prev]);
      resetForm();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this integration?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/tenant/integrations?tenant=${tenantSlug}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setIntegrations(prev => prev.filter(i => i.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">Connect external services to your workspace.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Integration
        </button>
      </div>

      {/* Add Integration Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold mb-4">Add Integration</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  required
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="My Integration"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={type}
                  onChange={e => { setType(e.target.value as IntegrationType); setConfig({}); }}
                >
                  {TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <ConfigFields type={type} config={config} onChange={handleConfigChange} />
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Integration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Integrations List */}
      {integrations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No integrations yet.</p>
          <p className="text-sm mt-1">Click &ldquo;Add Integration&rdquo; to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map(integration => (
            <div key={integration.id} className="border rounded-lg p-4 flex items-center justify-between bg-white shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{integration.name}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">{integration.type}</span>
                  {integration.is_active ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Active</span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inactive</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">Added {new Date(integration.created_at).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => handleDelete(integration.id)}
                disabled={deleting === integration.id}
                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {deleting === integration.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
