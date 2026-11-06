'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import type { CustomComponent, ComponentPropDef, ComponentEventDef } from '@/platform/custom-components/types'

type PropType = ComponentPropDef['type']

function PropSchemaEditor({ props, onChange }: { props: ComponentPropDef[]; onChange: (p: ComponentPropDef[]) => void }) {
  const propTypes: PropType[] = ['string', 'number', 'boolean', 'object', 'array']
  const addProp = () => onChange([...props, { name: '', type: 'string', required: false }])
  const updateProp = (i: number, patch: Partial<ComponentPropDef>) => onChange(props.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  const removeProp = (i: number) => onChange(props.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 uppercase">Props</span>
        <button type="button" onClick={addProp} className="text-xs text-indigo-600">+ Add prop</button>
      </div>
      {props.map((prop, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input type="text" placeholder="name" value={prop.name} onChange={e => updateProp(i, { name: e.target.value })} className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" />
          <select value={prop.type} onChange={e => updateProp(i, { type: e.target.value as PropType })} className="text-xs border border-gray-300 rounded px-2 py-1">
            {propTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" checked={prop.required} onChange={e => updateProp(i, { required: e.target.checked })} /> req
          </label>
          <button type="button" onClick={() => removeProp(i)} className="text-gray-400 hover:text-red-500 text-xs">X</button>
        </div>
      ))}
    </div>
  )
}

function EventSchemaEditor({ events, onChange }: { events: ComponentEventDef[]; onChange: (e: ComponentEventDef[]) => void }) {
  const addEvent = () => onChange([...events, { name: '', payloadSchema: [] }])
  const updateEvent = (i: number, patch: Partial<ComponentEventDef>) => onChange(events.map((e, idx) => idx === i ? { ...e, ...patch } : e))
  const removeEvent = (i: number) => onChange(events.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 uppercase">Events</span>
        <button type="button" onClick={addEvent} className="text-xs text-indigo-600">+ Add event</button>
      </div>
      {events.map((event, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input type="text" placeholder="onEventName" value={event.name} onChange={e => updateEvent(i, { name: e.target.value })} className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" />
          <input type="text" placeholder="description" value={event.description ?? ''} onChange={e => updateEvent(i, { description: e.target.value })} className="flex-1 text-xs border border-gray-300 rounded px-2 py-1" />
          <button type="button" onClick={() => removeEvent(i)} className="text-gray-400 hover:text-red-500 text-xs">X</button>
        </div>
      ))}
    </div>
  )
}

function ComponentPreview({ sourceCode }: { sourceCode: string }) {
  if (!sourceCode.trim()) return <div className="flex items-center justify-center h-32 bg-gray-50 border border-gray-200 rounded text-sm text-gray-400">Enter source code to preview</div>
  const sdkScript = `<script>(function(){window.novo={props:{},emit:function(n,d){parent.postMessage({type:'novo:event',payload:{eventName:n,data:d}},'*');},resize:function(h){parent.postMessage({type:'novo:resize',payload:h},'*');}};window.addEventListener('message',function(e){if(e.data&&e.data.type==='novo:props')window.novo.props=e.data.payload||{};});})();<\/script>`
  const srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>* { box-sizing: border-box; } body { margin: 0; padding: 8px; font-family: system-ui, sans-serif; }</style>${sdkScript}</head><body>${sourceCode}</body></html>`
  return <iframe title="preview" sandbox="allow-scripts allow-same-origin" srcDoc={srcdoc} className="w-full border border-gray-200 rounded" style={{ height: '200px' }} />
}

export default function CustomComponentsPage() {
  const params = useParams<{ appId: string }>()
  const appId = params.appId
  const [components, setComponents] = useState<CustomComponent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editorName, setEditorName] = useState('')
  const [editorDescription, setEditorDescription] = useState('')
  const [editorSource, setEditorSource] = useState('')
  const [editorProps, setEditorProps] = useState<ComponentPropDef[]>([])
  const [editorEvents, setEditorEvents] = useState<ComponentEventDef[]>([])

  const fetchComponents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/builder/apps/${appId}/custom-components`)
      const data = (await res.json()) as { components?: CustomComponent[] }
      setComponents(data.components ?? [])
    } finally { setLoading(false) }
  }, [appId])

  useEffect(() => { void fetchComponents() }, [fetchComponents])

  const selectComponent = (c: CustomComponent) => {
    setSelectedId(c.id); setEditorName(c.name); setEditorDescription(c.description ?? '')
    setEditorSource(c.sourceCode); setEditorProps(c.propsSchema); setEditorEvents(c.eventsSchema)
  }

  const createNew = () => {
    setSelectedId(null); setEditorName(''); setEditorDescription('')
    setEditorSource('<button>Click me</button>')
    setEditorProps([]); setEditorEvents([])
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = { name: editorName, description: editorDescription, sourceCode: editorSource, propsSchema: editorProps, eventsSchema: editorEvents }
      const url = selectedId ? `/api/builder/apps/${appId}/custom-components/${selectedId}` : `/api/builder/apps/${appId}/custom-components`
      const res = await fetch(url, { method: selectedId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = (await res.json()) as { component?: CustomComponent }
      if (data.component && !selectedId) setSelectedId(data.component.id)
      await fetchComponents()
    } finally { setSaving(false) }
  }

  const publish = async () => {
    if (!selectedId) return
    setPublishing(true)
    try {
      await save()
      await fetch(`/api/builder/apps/${appId}/custom-components/${selectedId}/publish`, { method: 'POST' })
      await fetchComponents()
    } finally { setPublishing(false) }
  }

  const deleteComponent = async (id: string) => {
    if (!confirm('Delete this component?')) return
    await fetch(`/api/builder/apps/${appId}/custom-components/${id}`, { method: 'DELETE' })
    if (selectedId === id) createNew()
    await fetchComponents()
  }

  const selected = components.find(c => c.id === selectedId) ?? null

  return (
    <div className="flex h-full bg-white">
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-sm text-gray-900">Custom Components</h2>
          <button type="button" onClick={createNew} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded">New</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="p-4 text-sm text-gray-400">Loading...</div> : components.length === 0 ? <div className="p-4 text-sm text-gray-400">No components yet</div> : components.map(c => (
            <button key={c.id} type="button" onClick={() => selectComponent(c)} className={['w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50', selectedId === c.id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''].join(' ')}>
              <div className="font-medium text-sm text-gray-900">{c.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">v{c.version}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center gap-3">
          <input type="text" placeholder="Component name" value={editorName} onChange={e => setEditorName(e.target.value)} className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5" />
          <input type="text" placeholder="Description" value={editorDescription} onChange={e => setEditorDescription(e.target.value)} className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5" />
          <button type="button" onClick={() => void save()} disabled={saving || !editorName} className="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          <button type="button" onClick={() => void publish()} disabled={publishing || !selectedId || !editorName} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded disabled:opacity-50">{publishing ? 'Publishing...' : 'Publish'}</button>
          {selectedId && <button type="button" onClick={() => void deleteComponent(selectedId)} className="text-sm text-red-600 px-2 py-1.5">Delete</button>}
        </div>
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col p-4 overflow-y-auto">
            <label className="text-xs font-medium text-gray-600 uppercase mb-2">Source Code</label>
            <textarea value={editorSource} onChange={e => setEditorSource(e.target.value)} className="flex-1 font-mono text-xs border border-gray-300 rounded p-3 resize-none" style={{ minHeight: '300px' }} spellCheck={false} />
            <div className="mt-4 space-y-4">
              <PropSchemaEditor props={editorProps} onChange={setEditorProps} />
              <EventSchemaEditor events={editorEvents} onChange={setEditorEvents} />
            </div>
          </div>
          <div className="w-80 border-l border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-600 uppercase mb-2">Live Preview {selected ? `(v${selected.version})` : '(unsaved)'}</div>
            <ComponentPreview sourceCode={editorSource} />
          </div>
        </div>
      </div>
    </div>
  )
}
