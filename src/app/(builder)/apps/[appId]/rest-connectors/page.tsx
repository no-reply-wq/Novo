'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { RESTConnector, RESTRequest, RESTAuthConfig } from '@/platform/integrations/rest/types';

type AuthType = RESTConnector['authType'];
type HttpMethod = RESTRequest['method'];

const AUTH_TYPES: AuthType[] = ['none', 'api_key', 'bearer', 'basic', 'oauth2'];
const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// ─── Request editor ────────────────────────────────────────────────────────────

function RequestEditor({
  request,
  onSave,
  onCancel,
}: {
  request: Partial<RESTRequest>;
  onSave: (r: RESTRequest) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<RESTRequest>>({ method: 'GET', ...request });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const patch = (p: Partial<RESTRequest>) => setForm(f => ({ ...f, ...p }));

  const isValid = !!form.name && !!form.path && !!form.method;

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      id: form.id ?? `req_${Date.now()}`,
      name: form.name!,
      method: form.method!,
      path: form.path!,
      headers: form.headers,
      queryParams: form.queryParams,
      bodyTemplate: form.bodyTemplate,
      responseMapping: form.responseMapping,
    });
  };

  return (
    <div className="border border-gray-200 rounded p-4 space-y-3 bg-gray-50">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Request name"
          value={form.name ?? ''}
          onChange={e => patch({ name: e.target.value })}
          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={form.method ?? 'GET'}
          onChange={e => patch({ method: e.target.value as HttpMethod })}
          className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <input
        type="text"
        placeholder="Path (e.g. /users/{{ params.id }})"
        value={form.path ?? ''}
        onChange={e => patch({ path: e.target.value })}
        className="w-full font-mono text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <textarea
        placeholder='Body template (JSON with {{ expr }})'
        value={form.bodyTemplate ?? ''}
        onChange={e => patch({ bodyTemplate: e.target.value || undefined })}
        className="w-full font-mono text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
        rows={3}
      />
      <textarea
        placeholder={'Response mapping (JSON: { "output.field": "jsonpath.key" })'}
        value={form.responseMapping ? JSON.stringify(form.responseMapping, null, 2) : ''}
        onChange={e => {
          try {
            const parsed = JSON.parse(e.target.value) as Record<string, string>;
            patch({ responseMapping: parsed });
          } catch {
            /* ignore parse errors */
          }
        }}
        className="w-full font-mono text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
        rows={2}
      />
      {testResult && (
        <pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-32">
          {testResult}
        </pre>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid}
          className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          Save request
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-600 px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100"
        >
          Cancel
        </button>
        {testing && <span className="text-xs text-gray-400 self-center">Testing…</span>}
        {!testing && testResult === null && (
          <span className="text-xs text-gray-400 self-center">Use Test button in connector view</span>
        )}
      </div>
    </div>
  );
}

// ─── Auth config editor ────────────────────────────────────────────────────────

function AuthConfigEditor({
  authType,
  authConfig,
  onAuthTypeChange,
  onAuthConfigChange,
}: {
  authType: AuthType;
  authConfig: RESTAuthConfig;
  onAuthTypeChange: (t: AuthType) => void;
  onAuthConfigChange: (c: RESTAuthConfig) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600 w-20">Auth type</label>
        <select
          value={authType}
          onChange={e => {
            const t = e.target.value as AuthType;
            onAuthTypeChange(t);
            onAuthConfigChange({ type: t } as RESTAuthConfig);
          }}
          className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {AUTH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {authType === 'api_key' && authConfig.type === 'api_key' && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Header name (e.g. X-API-Key)"
            value={authConfig.headerName}
            onChange={e => onAuthConfigChange({ ...authConfig, headerName: e.target.value })}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="text"
            placeholder="Secret key reference"
            value={authConfig.keyRef}
            onChange={e => onAuthConfigChange({ ...authConfig, keyRef: e.target.value })}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}
      {authType === 'bearer' && authConfig.type === 'bearer' && (
        <input
          type="text"
          placeholder="Token secret reference"
          value={authConfig.tokenRef}
          onChange={e => onAuthConfigChange({ ...authConfig, tokenRef: e.target.value })}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      )}
      {authType === 'basic' && authConfig.type === 'basic' && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Username"
            value={authConfig.username}
            onChange={e => onAuthConfigChange({ ...authConfig, username: e.target.value })}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="text"
            placeholder="Password secret reference"
            value={authConfig.passwordRef}
            onChange={e => onAuthConfigChange({ ...authConfig, passwordRef: e.target.value })}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}
      {authType === 'oauth2' && authConfig.type === 'oauth2' && (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Token URL"
            value={authConfig.tokenUrl}
            onChange={e => onAuthConfigChange({ ...authConfig, tokenUrl: e.target.value })}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Client ID"
              value={authConfig.clientId}
              onChange={e => onAuthConfigChange({ ...authConfig, clientId: e.target.value })}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Client secret reference"
              value={authConfig.clientSecretRef}
              onChange={e => onAuthConfigChange({ ...authConfig, clientSecretRef: e.target.value })}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <input
            type="text"
            placeholder="Scopes (space-separated)"
            value={authConfig.scopes.join(' ')}
            onChange={e => onAuthConfigChange({ ...authConfig, scopes: e.target.value.split(' ').filter(Boolean) })}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function RESTConnectorsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  const [connectors, setConnectors] = useState<RESTConnector[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRequest, setEditingRequest] = useState<Partial<RESTRequest> | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

  // Editor state
  const [editorName, setEditorName] = useState('');
  const [editorBaseUrl, setEditorBaseUrl] = useState('');
  const [editorAuthType, setEditorAuthType] = useState<AuthType>('none');
  const [editorAuthConfig, setEditorAuthConfig] = useState<RESTAuthConfig>({ type: 'none' });
  const [editorHeaders, setEditorHeaders] = useState('{}');
  const [editorRequests, setEditorRequests] = useState<RESTRequest[]>([]);

  const fetchConnectors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/rest-connectors`);
      const data = (await res.json()) as { connectors?: RESTConnector[] };
      setConnectors(data.connectors ?? []);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void fetchConnectors();
  }, [fetchConnectors]);

  const selectConnector = (c: RESTConnector) => {
    setSelectedId(c.id);
    setEditorName(c.name);
    setEditorBaseUrl(c.baseUrl);
    setEditorAuthType(c.authType);
    setEditorAuthConfig(c.authConfig);
    setEditorHeaders(JSON.stringify(c.defaultHeaders, null, 2));
    setEditorRequests(c.requests);
    setEditingRequest(null);
  };

  const createNew = () => {
    setSelectedId(null);
    setEditorName('');
    setEditorBaseUrl('');
    setEditorAuthType('none');
    setEditorAuthConfig({ type: 'none' });
    setEditorHeaders('{}');
    setEditorRequests([]);
    setEditingRequest(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      let defaultHeaders: Record<string, string> = {};
      try { defaultHeaders = JSON.parse(editorHeaders) as Record<string, string>; } catch { /* keep empty */ }

      const payload = {
        name: editorName,
        baseUrl: editorBaseUrl,
        authType: editorAuthType,
        authConfig: editorAuthConfig,
        defaultHeaders,
        requests: editorRequests,
      };

      const url = selectedId
        ? `/api/builder/apps/${appId}/rest-connectors/${selectedId}`
        : `/api/builder/apps/${appId}/rest-connectors`;
      const method = selectedId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { connector?: RESTConnector };
      if (data.connector && !selectedId) setSelectedId(data.connector.id);
      await fetchConnectors();
    } finally {
      setSaving(false);
    }
  };

  const deleteConnector = async (id: string) => {
    if (!confirm('Delete this connector?')) return;
    await fetch(`/api/builder/apps/${appId}/rest-connectors/${id}`, { method: 'DELETE' });
    if (selectedId === id) createNew();
    await fetchConnectors();
  };

  const testRequest = async (req: RESTRequest) => {
    if (!selectedId) return;
    setTesting(req.id);
    try {
      const res = await fetch(
        `/api/runtime/test/rest/${selectedId}/${req.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      const data = await res.json() as unknown;
      setTestResults(r => ({ ...r, [req.id]: JSON.stringify(data, null, 2) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error';
      setTestResults(r => ({ ...r, [req.id]: message }));
    } finally {
      setTesting(null);
    }
  };

  const saveRequest = (r: RESTRequest) => {
    setEditorRequests(prev => {
      const idx = prev.findIndex(x => x.id === r.id);
      if (idx >= 0) {
        return prev.map((x, i) => (i === idx ? r : x));
      }
      return [...prev, r];
    });
    setEditingRequest(null);
  };

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-gray-900">REST Connectors</h2>
          <button
            type="button"
            onClick={createNew}
            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
          >
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-400">Loading…</div>
          ) : connectors.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">No connectors yet</div>
          ) : (
            connectors.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectConnector(c)}
                className={[
                  'w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50',
                  selectedId === c.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : '',
                ].join(' ')}
              >
                <div className="font-medium text-sm text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{c.baseUrl}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Basic config */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Connector</h3>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Connector name"
              value={editorName}
              onChange={e => setEditorName(e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="url"
              placeholder="Base URL (https://api.example.com)"
              value={editorBaseUrl}
              onChange={e => setEditorBaseUrl(e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <AuthConfigEditor
            authType={editorAuthType}
            authConfig={editorAuthConfig}
            onAuthTypeChange={t => { setEditorAuthType(t); setEditorAuthConfig({ type: t } as RESTAuthConfig); }}
            onAuthConfigChange={setEditorAuthConfig}
          />

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Default headers (JSON)</label>
            <textarea
              value={editorHeaders}
              onChange={e => setEditorHeaders(e.target.value)}
              className="w-full font-mono text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !editorName || !editorBaseUrl}
              className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {selectedId && (
              <button
                type="button"
                onClick={() => void deleteConnector(selectedId)}
                className="text-sm text-red-600 hover:text-red-700 px-3 py-1.5"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Requests */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Requests</h3>
            <button
              type="button"
              onClick={() => setEditingRequest({})}
              className="text-xs bg-white border border-gray-300 text-gray-700 px-2 py-1 rounded hover:bg-gray-50"
            >
              + Add request
            </button>
          </div>

          {editingRequest && (
            <RequestEditor
              request={editingRequest}
              onSave={saveRequest}
              onCancel={() => setEditingRequest(null)}
            />
          )}

          {editorRequests.map(req => (
            <div key={req.id} className="border border-gray-200 rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-block text-xs font-mono bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded mr-2">{req.method}</span>
                  <span className="font-medium text-sm text-gray-900">{req.name}</span>
                  <span className="text-xs text-gray-500 ml-2 font-mono">{req.path}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void testRequest(req)}
                    disabled={testing === req.id || !selectedId}
                    className="text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                  >
                    {testing === req.id ? 'Testing…' : 'Test'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRequest(req)}
                    className="text-xs text-gray-600 hover:text-gray-900"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorRequests(r => r.filter(x => x.id !== req.id))}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {testResults[req.id] && (
                <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-32">
                  {testResults[req.id]}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
