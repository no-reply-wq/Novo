'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import type { Portal } from '@/platform/portals/types'

interface ApiPortal {
  id: string
  name: string
  slug: string
  type: string
  config: Partial<Portal>
  created_at: string
}

const S: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '32px 16px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#111827',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  btn: {
    padding: '9px 18px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '16px 20px',
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: (type: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 600,
    background: type === 'customer' ? '#dbeafe' : type === 'public' ? '#dcfce7' : '#f3f4f6',
    color: type === 'customer' ? '#1d4ed8' : type === 'public' ? '#16a34a' : '#374151',
  }),
  modal: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modalBox: {
    background: '#fff',
    borderRadius: 12,
    padding: '28px 24px',
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 13,
    color: '#111827',
    boxSizing: 'border-box' as const,
    marginBottom: 14,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 4,
  },
  linkBox: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    padding: '7px 10px',
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'monospace',
    wordBreak: 'break-all' as const,
    marginTop: 6,
  },
}

export default function PortalsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const appId = params?.appId as string
  const tenantSlug = searchParams?.get('tenant') ?? ''

  const [portals, setPortals] = useState<ApiPortal[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', type: 'customer' as Portal['type'] })
  const [createError, setCreateError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const loadPortals = useCallback(async () => {
    if (!appId || !tenantSlug) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/builder/apps/${appId}/portals?tenant=${tenantSlug}`)
      if (res.ok) {
        const data = await res.json() as { portals: ApiPortal[] }
        setPortals(data.portals ?? [])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [appId, tenantSlug])

  useEffect(() => { void loadPortals() }, [loadPortals])

  async function createPortal() {
    setCreateError('')
    if (!form.name.trim() || !form.slug.trim()) {
      setCreateError('Name and slug are required')
      return
    }
    setCreating(true)
    try {
      const res = await fetch(`/api/builder/apps/${appId}/portals?tenant=${tenantSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setCreateError(data.error ?? 'Failed to create portal')
        return
      }
      setShowModal(false)
      setForm({ name: '', slug: '', type: 'customer' })
      await loadPortals()
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }

  function getPortalLink(portalSlug: string): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/portal/${tenantSlug}/${portalSlug}`
    }
    return `/portal/${tenantSlug}/${portalSlug}`
  }

  async function copyLink(portalSlug: string) {
    const link = getPortalLink(portalSlug)
    await navigator.clipboard.writeText(link)
    setCopied(portalSlug)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Portals</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            External access points for customers, vendors, and partners
          </p>
        </div>
        <button style={S.btn} onClick={() => setShowModal(true)} type="button">
          + Create Portal
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: 14 }}>Loading portals…</p>
      ) : portals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <p style={{ color: '#9ca3af', fontSize: 15, margin: 0 }}>No portals yet. Create one to let external users access your app.</p>
        </div>
      ) : (
        <div>
          {portals.map((portal) => (
            <div key={portal.id} style={S.card}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{portal.name}</span>
                  <span style={S.badge(portal.type)}>{portal.type}</span>
                </div>
                <div style={S.linkBox}>{getPortalLink(portal.slug)}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
                  Created {new Date(portal.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
                <button
                  onClick={() => void copyLink(portal.slug)}
                  type="button"
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                    background: copied === portal.slug ? '#dcfce7' : '#fff',
                    color: copied === portal.slug ? '#16a34a' : '#374151',
                  }}
                >
                  {copied === portal.slug ? 'Copied!' : 'Copy link'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div style={S.modal} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={S.modalBox}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Create Portal</h2>

            <label style={S.label}>Portal Name</label>
            <input
              style={S.input}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Customer Portal"
              autoFocus
            />

            <label style={S.label}>URL Slug</label>
            <input
              style={S.input}
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
              placeholder="customer-portal"
            />

            <label style={S.label}>Type</label>
            <select
              style={{ ...S.input, marginBottom: 20 }}
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Portal['type'] }))}
            >
              <option value="customer">Customer</option>
              <option value="vendor">Vendor</option>
              <option value="partner">Partner</option>
              <option value="public">Public</option>
            </select>

            {createError && (
              <div style={{ marginBottom: 14, color: '#dc2626', fontSize: 13, background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowModal(false); setCreateError('') }}
                type="button"
                style={{ padding: '8px 16px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: '#fff' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void createPortal()}
                disabled={creating}
                type="button"
                style={{ ...S.btn, opacity: creating ? 0.7 : 1 }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
