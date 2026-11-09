'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FileText, Plus, Edit2, Trash2, Eye } from 'lucide-react'

interface PdfTemplate {
  id: string
  name: string
  created_at: string
}

export default function PdfTemplatesPage() {
  const { appId } = useParams<{ appId: string }>()
  const router = useRouter()
  const [templates, setTemplates] = useState<PdfTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchTemplates() {
    setLoading(true)
    try {
      const res = await fetch(`/api/builder/apps/${appId}/pdf-templates`)
      if (!res.ok) throw new Error('Failed to load templates')
      const data = await res.json()
      setTemplates(data.templates ?? data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTemplates() }, [appId])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`/api/builder/apps/${appId}/pdf-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error('Failed to create template')
      const data = await res.json()
      const id = data.template?.id ?? data.id
      router.push(`/apps/${appId}/pdf-templates/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating template')
      setCreating(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/builder/apps/${appId}/pdf-templates/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete template')
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error deleting template')
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6 text-[#009A8A]" />
          <h1 className="text-2xl font-semibold text-gray-900">PDF Templates</h1>
        </div>
        <button
          onClick={() => { setShowModal(true); setNewName(''); setError(null) }}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-white text-sm font-medium"
          style={{ backgroundColor: '#009A8A' }}
        >
          <Plus className="w-4 h-4" />
          Create Template
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No PDF templates yet. Create your first one.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Created At</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(t.created_at).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => router.push(`/apps/${appId}/pdf-templates/${t.id}?preview=1`)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => router.push(`/apps/${appId}/pdf-templates/${t.id}`)}
                        className="p-1.5 text-gray-400 hover:text-[#009A8A] rounded"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(t.id, t.name)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create PDF Template</h2>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Invoice Template"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="px-4 py-2 text-sm text-white rounded-md disabled:opacity-50"
                style={{ backgroundColor: '#009A8A' }}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
