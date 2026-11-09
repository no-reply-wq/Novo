'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FileText, Save, ArrowLeft, Type, AlignLeft, Table2, Image, Space } from 'lucide-react'

type ElementType = 'heading' | 'text' | 'table' | 'image' | 'spacer'

interface CanvasElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  content: string
  props: Record<string, unknown>
}

interface Template {
  id: string
  name: string
  canvas_definition: { elements: CanvasElement[] } | null
}

const ELEMENT_DEFAULTS: Record<ElementType, Partial<CanvasElement>> = {
  heading: { width: 400, height: 48, content: 'Heading', props: { fontSize: 24, fontWeight: 'bold' } },
  text:    { width: 400, height: 60, content: 'Text block', props: { fontSize: 14 } },
  table:   { width: 500, height: 120, content: 'Table', props: { rows: 3, cols: 3 } },
  image:   { width: 200, height: 150, content: 'Image', props: { src: '' } },
  spacer:  { width: 400, height: 24, content: '', props: {} },
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export default function PdfTemplateEditorPage() {
  const { appId, templateId } = useParams<{ appId: string; templateId: string }>()
  const router = useRouter()
  const [template, setTemplate] = useState<Template | null>(null)
  const [elements, setElements] = useState<CanvasElement[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const dragRef = useRef<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null)

  useEffect(() => {
    fetch(`/api/builder/apps/${appId}/pdf-templates/${templateId}`)
      .then(r => r.json())
      .then(data => {
        const t: Template = data.template ?? data
        setTemplate(t)
        setElements(t.canvas_definition?.elements ?? [])
      })
      .catch(() => setError('Failed to load template'))
  }, [appId, templateId])

  const addElement = useCallback((type: ElementType) => {
    const defaults = ELEMENT_DEFAULTS[type]
    const el: CanvasElement = {
      id: uid(),
      type,
      x: 40,
      y: elements.length * 60 + 20,
      width: defaults.width ?? 200,
      height: defaults.height ?? 40,
      content: defaults.content ?? '',
      props: defaults.props ?? {},
    }
    setElements(prev => [...prev, el])
    setSelected(el.id)
  }, [elements.length])

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const el = elements.find(x => x.id === id)
    if (!el) return
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y }
    setSelected(id)

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setElements(prev => prev.map(el =>
        el.id === dragRef.current!.id
          ? { ...el, x: dragRef.current!.elX + dx, y: dragRef.current!.elY + dy }
          : el
      ))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const selectedEl = elements.find(e => e.id === selected)

  const updateSelected = (patch: Partial<CanvasElement>) => {
    setElements(prev => prev.map(el => el.id === selected ? { ...el, ...patch } : el))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/builder/apps/${appId}/pdf-templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas_definition: { elements } }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error saving')
    } finally {
      setSaving(false)
    }
  }

  const palette: { type: ElementType; label: string; icon: React.ReactNode }[] = [
    { type: 'heading', label: 'Heading', icon: <Type className="w-4 h-4" /> },
    { type: 'text',    label: 'Text',    icon: <AlignLeft className="w-4 h-4" /> },
    { type: 'table',   label: 'Table',   icon: <Table2 className="w-4 h-4" /> },
    { type: 'image',   label: 'Image',   icon: <Image className="w-4 h-4" /> },
    { type: 'spacer',  label: 'Spacer',  icon: <Space className="w-4 h-4" /> },
  ]

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/apps/${appId}/pdf-templates`)}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <FileText className="w-5 h-5 text-[#009A8A]" />
          <span className="font-semibold text-gray-900 text-sm">
            {template?.name ?? 'Loading...'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-600">{error}</span>}
          {saved && <span className="text-xs text-green-600">Saved</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50"
            style={{ backgroundColor: '#009A8A' }}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: element palette */}
        <div className="w-48 bg-white border-r border-gray-200 p-3 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Elements</p>
          <div className="space-y-1">
            {palette.map(item => (
              <button
                key={item.type}
                onClick={() => addElement(item.type)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-50 hover:text-[#009A8A] text-left"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Center: A4 canvas */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-8">
          <div
            className="relative bg-white shadow-lg flex-shrink-0"
            style={{ width: '794px', minHeight: '1123px' }}
            onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}
          >
            {elements.map(el => (
              <div
                key={el.id}
                onMouseDown={e => handleMouseDown(e, el.id)}
                className="absolute cursor-move select-none"
                style={{
                  left: el.x,
                  top: el.y,
                  width: el.width,
                  minHeight: el.height,
                  outline: selected === el.id ? '2px solid #009A8A' : '1px dashed #d1d5db',
                  borderRadius: 2,
                  padding: '4px 8px',
                  boxSizing: 'border-box',
                }}
              >
                {el.type === 'heading' && (
                  <span style={{ fontSize: (el.props.fontSize as number) ?? 24, fontWeight: 'bold' }}>
                    {el.content}
                  </span>
                )}
                {el.type === 'text' && (
                  <span style={{ fontSize: (el.props.fontSize as number) ?? 14 }}>{el.content}</span>
                )}
                {el.type === 'table' && (
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      {Array.from({ length: (el.props.rows as number) ?? 3 }).map((_, r) => (
                        <tr key={r}>
                          {Array.from({ length: (el.props.cols as number) ?? 3 }).map((_, c) => (
                            <td key={c} className="border border-gray-300 px-2 py-1">Cell {r+1},{c+1}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {el.type === 'image' && (
                  <div className="flex items-center justify-center bg-gray-100 text-gray-400 text-xs" style={{ width: el.width, height: el.height }}>
                    <Image className="w-6 h-6 mr-1" /> Image placeholder
                  </div>
                )}
                {el.type === 'spacer' && (
                  <div className="border-t border-dashed border-gray-300 w-full" />
                )}
              </div>
            ))}
            {elements.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">
                Add elements from the left panel
              </div>
            )}
          </div>
        </div>

        {/* Right panel: properties */}
        <div className="w-56 bg-white border-l border-gray-200 p-3 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Properties</p>
          {!selectedEl ? (
            <p className="text-xs text-gray-400">Select an element to edit its properties.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Content</label>
                <textarea
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1"
                  style={{ '--tw-ring-color': '#009A8A' } as React.CSSProperties}
                  rows={3}
                  value={selectedEl.content}
                  onChange={e => updateSelected({ content: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Width</label>
                  <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none" value={selectedEl.width}
                    onChange={e => updateSelected({ width: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Height</label>
                  <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none" value={selectedEl.height}
                    onChange={e => updateSelected({ height: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">X</label>
                  <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none" value={selectedEl.x}
                    onChange={e => updateSelected({ x: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Y</label>
                  <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none" value={selectedEl.y}
                    onChange={e => updateSelected({ y: Number(e.target.value) })} />
                </div>
              </div>
              {selectedEl.type === 'heading' || selectedEl.type === 'text' ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Font Size</label>
                  <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none"
                    value={(selectedEl.props.fontSize as number) ?? 14}
                    onChange={e => updateSelected({ props: { ...selectedEl.props, fontSize: Number(e.target.value) } })} />
                </div>
              ) : null}
              {selectedEl.type === 'table' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Rows</label>
                    <input type="number" min={1} className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={(selectedEl.props.rows as number) ?? 3}
                      onChange={e => updateSelected({ props: { ...selectedEl.props, rows: Number(e.target.value) } })} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Columns</label>
                    <input type="number" min={1} className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none"
                      value={(selectedEl.props.cols as number) ?? 3}
                      onChange={e => updateSelected({ props: { ...selectedEl.props, cols: Number(e.target.value) } })} />
                  </div>
                </>
              )}
              <button
                onClick={() => {
                  setElements(prev => prev.filter(e => e.id !== selected))
                  setSelected(null)
                }}
                className="w-full px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
              >
                Remove element
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
