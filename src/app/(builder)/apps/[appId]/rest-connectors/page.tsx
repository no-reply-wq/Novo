'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import type { RESTConnector, RESTRequest, RESTAuthConfig, RESTAuthType } from '@/platform/integrations/rest/types'

const AUTH_TYPES: RESTAuthType[] = ['none', 'api_key', 'bearer', 'basic', 'oauth2']

function AuthEditor({ auth, onChange }: { auth: RESTAuthConfig; onChange: (a: RESTAuthConfig) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-gray-500">Auth type</label>
        <select value={auth.type} onChange={e => onChange({ type: e.target.value as RESTAuthType })} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mt-1">
          {AUTH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {auth.type === 'api_key' && (
        <>
          <div><label className="text-xs text-gray-500">Key name</label><input type="text" value={auth.keyName ?? ''} onChange={e => onChange({ ...auth, keyName: e.target.value })} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mt-1" /></div>
          <div><label className="text-xs text-gray-500">In</label><select value={auth.keyIn ?? 'header'} onChange={e => onChange({ ...auth, keyIn: e.target.value as 'header' | 'query' })} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mt-1"><option value="header">header</option><option value="query">query</option></select></div>
          <div><label className="text-xs text-gray-500">Key secret ref</label><input type="text" value={auth.keyRef ?? ''} onChange={e => onChange({ ...auth, keyRef: e.target.value })} placeholder="env var or secret key" className="w-full text-xs border border-gray-300 rounded px-2 py-1 mt-1" /></div>
        </>
      )}
      {auth.type === 'bearer' && (
        <div><label className="text-xs text-gray-500">Token secret ref</label><input type="text" value={auth.tokenRef ?? ''} onChange={e => onChange({ ...auth, tokenRef: e.target.value })} placeholder="env var or secret key" className="w-full text-xs border border-gray-300 rounded px-2 py-1 mt-1" /></div>
      )}
      {auth.type === 'basic' && (
        <>
          <div><label className="text-xs text-gray-500">Username</label><input type="text" value={auth.username ?? ''} onChange={e => onChange({ ...auth, username: e.target.value })} className="w-full text-xs border border-gray-300 rounded px-2 py-1 mt-1" /></div>
          <div><label className="text-xs text-gray-500">Password secret ref</label><input type="text" value={auth.passwordRef ?? ''} onChange={e => onChange({ ...auth, passwordRef: e.target.value })} placeholder="env var or secret key" className="w-full text-xs border border-gray-300 rounded px-2 py-1 mt-1" /></div>
        </>
      )}
    </div>
  )
}

function RequestEditor({ req, onChange, onRemove }: { req: RESTRequest; onChange: (r: RESTRequest) => void; onRemove: () => void }) {
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
  return (
    <div className="border border-gray-200 rounded p-3 space-y-2">
      <div className="flex gap-2 items-center">
        <input type="text" placeholder="Request name" value={req.name} onChange={e => onChange({ ...req, name: e.target.value })} className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" />
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 text-xs">X</button>
      </div>
      <div className="flex gap-2">
        <select value={req.method} onChange={e => onChange({ ...req, method: e.target.value as RESTRequest['method'] })} className="text-xs border border-gray-300 rounded px-2 py-1">
          {methods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="text" placeholder="/path/{{id}}" value={req.path} onChange={e => onChange({ ...req, path: e.target.value })} className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 font-mono" />
      </div>
      {(req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') && (
        <div>
          <label className="text-xs text-gray-500">Body template (JSON with {'{{expr}}'})</label>
          <textarea value={req.bodyTemplate ?? ''} onChange={e => onChange({ ...req, bodyTemplate: e.target.value })} rows={3} className="w-full text-xs border border-gray-300 rounded px-2 py-1 font-mono resize-none mt-1" />
        </div>
      )}
      <div>
        <label className="text-xs text-gray-500">Response mapping (jsonPath=outputField, one per line)</label>
        <textarea
          value={Object.entries(req.responseMapping ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')}
          onChange={e => {
            const mapping: Record<string, string> = {}
            for (const line of e.target.value.split('\n')) {
              const idx = line.indexOf('=')
              if (idx > 0) mapping[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
            }
            onChange({ ...req, responseMapping: mapping })
          }}
          rows={2}
          placeholder="$.data.id=userId"
          className="w-full text-xs border border-gray-300 rounded px-2 py-1 font-mono resize-none mt-1"
        />
      </div>
    </div>
  )
}

export default function RESTConnectorsPage() {
  const params = useParams<{ appId: string }>()
  const appId = params.appId
  const [connectors, setConnectors] = useState<RESTConnector[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [editorName, setEditorName] = useState('')
  const [editorBaseUrl, setEditorBaseUrl] = useState('')
  const [editorAuth, setEditorAuth] = useState<RESTAuthConfig>({ type: 'none' })
  const [editorRequests, setEditorRequests] = useState<RESTRequest[]>([])

  const fetchConnectors = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/builder/apps/${appId}/rest-connectors`)
      const data = (await res.json()) as { connectors?: RESTConnector[] }
      setConnectors(data.connectors ?? [])
    } finally { setLoading(false) }
  }, [appId])

  useEffect(() => { void fetchConnectors() }, [fetchConnectors])

  const selectConnector = (c: RESTConnector) => {
    setSelectedId(c.id); setEditorName(c.name); setEditorBaseUrl(c.baseUrl)
    setEditorAuth(c.auth); setEditorRequests(c.requests ?? [])
    setTestResult(null)
  }

  const createNew = () => {
    setSelectedId(null); setEditorName(''); setEditorBaseUrl('https://api.example.com')
    setEditorAuth({ type: 'none' }); setEditorRequests([]); setTestResult(null)
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = { name: editorName, baseUrl: editorBaseUrl, auth: editorAuth, requests: editorRequests }
      const url = selectedId ? `/api/builder/apps/${appId}/rest-connectors/${selectedId}` : `/api/builder/apps/${appId}/rest-connectors`
      const res = await fetch(url, { method: selectedId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = (await res.json()) as { connector?: RESTConnector }
      if (data.connector && !selectedId) setSelectedId(data.connector.id)
      await fetchConnectors()
    } finally { setSaving(false) }
  }

  const addRequest = () => {
    const id = `req_${Date.now()}`
    setEditorRequests(prev => [...prev, { id, name: '', method: 'GET', path: '/' }])
  }

  const updateRequest = (i: number, r: RESTRequest) => setEditorRequests(prev => prev.map((x, idx) => idx === i ? r : x))
  const removeRequest = (i: number) => setEditorRequests(prev => prev.filter((_, idx) => idx !== i))

  const testRequest = async (req: RESTRequest) => {
    if (!selectedId) { await save(); }
    setTesting(true); setTestResult(null)
    try {
      // Use tenant slug placeholder for testing — real tenantSlug comes from app context
      const res = await fetch(`/api/runtime/test/rest/${selectedId ?? 'new'}/${req.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = (await res.json()) as unknown
      setTestResult(JSON.stringify(data, null, 2))
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Error')
    } finally { setTesting(false) }
  }

  return (
    <div className="flex h-full bg-white">
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-gray-900">REST Connectors</h2>
          <button type="button" onClick={createNew} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded">New</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="p-4 text-sm text-gray-400">Loading...</div> : connectors.length === 0 ? <div className="p-4 text-sm text-gray-400">No connectors yet</div> : connectors.map(c => (
            <button key={c.id} type="button" onClick={() => selectConnector(c)} className={['w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50', selectedId === c.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''].join(' ')}>
              <div className="font-medium text-sm text-gray-900">{c.name}</div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">{c.baseUrl}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center gap-3">
          <input type="text" placeholder="Connector name" value={editorName} onChange={e => setEditorName(e.target.value)} className="text-sm border border-gray-300 rounded px-3 py-1.5" style={{ width: '200px' }} />
          <input type="text" placeholder="https://api.example.com" value={editorBaseUrl} onChange={e => setEditorBaseUrl(e.target.value)} className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 font-mono" />
          <button type="button" onClick={() => void save()} disabled={saving || !editorName} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-700 uppercase mb-3">Authentication</h3>
            <AuthEditor auth={editorAuth} onChange={setEditorAuth} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-700 uppercase">Requests</h3>
              <button type="button" onClick={addRequest} className="text-xs text-indigo-600">+ Add request</button>
            </div>
            <div className="space-y-3">
              {editorRequests.map((req, i) => (
                <div key={req.id}>
                  <RequestEditor req={req} onChange={r => updateRequest(i, r)} onRemove={() => removeRequest(i)} />
                  <button type="button" onClick={() => void testRequest(req)} disabled={testing} className="mt-1 text-xs text-gray-500 hover:text-indigo-600 disabled:opacity-50">{testing ? 'Testing...' : 'Test request'}</button>
                </div>
              ))}
              {editorRequests.length === 0 && <div className="text-xs text-gray-400">No requests configured</div>}
            </div>
          </div>
          {testResult && (
            <div>
              <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Test Result</h3>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-48">{testResult}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
