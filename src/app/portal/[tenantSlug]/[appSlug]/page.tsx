'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────────────────────────
interface AppPage { id: string; name: string; slug: string; layout: LayoutComponent[] }
interface LayoutComponent { id: string; type: string; config: Record<string, unknown> }
interface Column { name: string; type: string }
interface Row { [key: string]: unknown }

// ─── DynamicTable ─────────────────────────────────────────────────────────────
function DynamicTable({ tableName, tenantSlug, appSlug }: { tableName: string; tenantSlug: string; appSlug: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [columns, setColumns] = useState<Column[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editRow, setEditRow] = useState<Row | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  const base = `/api/portal2/${tenantSlug}/${appSlug}/data`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${base}?table=${tableName}`)
      const d = await r.json() as { rows: Row[]; columns: Column[]; total: number }
      setRows(d.rows ?? [])
      setColumns(d.columns ?? [])
      setTotal(d.total ?? 0)
    } finally { setLoading(false) }
  }, [base, tableName])

  useEffect(() => { void load() }, [load])

  const editableCols = columns.filter(c => !['id','created_at','updated_at'].includes(c.name))

  async function handleSave() {
    if (editRow?.id) {
      await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: tableName, id: editRow.id, ...form }) })
    } else {
      await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: tableName, ...form }) })
    }
    setShowAddModal(false); setEditRow(null); setForm({})
    void load()
  }

  async function handleDelete(id: unknown) {
    if (!confirm('Delete this row?')) return
    await fetch(base, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: tableName, id }) })
    void load()
  }

  const displayCols = columns.filter(c => c.name !== 'id').slice(0, 8)
  const filtered = rows.filter(r => !search || Object.values(r).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
        <button onClick={() => { setEditRow(null); setForm({}); setShowAddModal(true) }} style={{ background: '#009A8A', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>+ Add Row</button>
      </div>
      {loading ? <div style={{ color: '#64748b', padding: 20 }}>Loading...</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {displayCols.map(c => <th key={c.name} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.name}</th>)}
                <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={String(row.id ?? i)} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {displayCols.map(c => <td key={c.name} style={{ padding: '8px 10px', color: '#1e293b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(row[c.name] ?? '')}</td>)}
                  <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => { setEditRow(row); setForm(Object.fromEntries(editableCols.map(c => [c.name, String(row[c.name] ?? '')]))); setShowAddModal(true) }} style={{ background: '#e2e8f0', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, marginRight: 4 }}>Edit</button>
                    <button onClick={() => void handleDelete(row.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={displayCols.length + 1} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No records found</td></tr>}
            </tbody>
          </table>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>Total: {total} records</div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 440, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#0f172a' }}>{editRow ? 'Edit Row' : 'Add Row'}</h3>
            {editableCols.map(col => (
              <div key={col.name} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>{col.name}</label>
                <input value={form[col.name] ?? ''} onChange={e => setForm(p => ({ ...p, [col.name]: e.target.value }))} style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setShowAddModal(false); setEditRow(null); setForm({}) }} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={() => void handleSave()} style={{ background: '#009A8A', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── RenderComponent ──────────────────────────────────────────────────────────
function RenderComponent({ comp, tenantSlug, appSlug }: { comp: LayoutComponent; tenantSlug: string; appSlug: string }) {
  switch (comp.type) {
    case 'heading':
      return <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>{String(comp.config.text ?? '')}</h2>
    case 'text':
      return <p style={{ color: '#475569', margin: '0 0 12px', lineHeight: 1.6 }}>{String(comp.config.text ?? '')}</p>
    case 'badge':
      return <span style={{ background: '#e0f2f1', color: '#009A8A', fontSize: 12, fontWeight: 600, borderRadius: 20, padding: '3px 10px', display: 'inline-block', marginBottom: 8 }}>{String(comp.config.label ?? '')}</span>
    case 'divider':
      return <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '12px 0' }} />
    case 'table_view':
    case 'table': {
      const tbl = String(comp.config.tableName ?? comp.config.table ?? '')
      if (!tbl) return <div style={{ color: '#94a3b8', padding: 12 }}>No table configured</div>
      return <DynamicTable tableName={tbl} tenantSlug={tenantSlug} appSlug={appSlug} />
    }
    case 'card': {
      return (
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 20, marginBottom: 12 }}>
          {comp.config.title != null && <h3 style={{ margin: '0 0 8px', fontSize: 15, color: '#0f172a' }}>{String(comp.config.title)}</h3>}
          {comp.config.text != null && <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>{String(comp.config.text)}</p>}
        </div>
      )
    }
    case 'button':
      return (
        <button onClick={() => comp.config.href ? window.open(String(comp.config.href), '_blank') : undefined}
          style={{ background: '#009A8A', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>
          {String(comp.config.label ?? 'Button')}
        </button>
      )
    default:
      return null
  }
}

// ─── Main Portal Page ─────────────────────────────────────────────────────────
export default function PortalPage() {
  const params = useParams()
  const router = useRouter()
  const tenantSlug = String(params.tenantSlug ?? '')
  const appSlug = String(params.appSlug ?? '')

  const [pages, setPages] = useState<AppPage[]>([])
  const [activePage, setActivePage] = useState<AppPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    // Check for portal_token cookie
    const hasCookie = document.cookie.includes('portal_token=')
    if (!hasCookie) {
      router.push(`/portal/${tenantSlug}/${appSlug}/login`)
      return
    }

    async function loadPages() {
      try {
        const r = await fetch(`/api/portal2/${tenantSlug}/${appSlug}/pages`)
        if (r.status === 401) {
          router.push(`/portal/${tenantSlug}/${appSlug}/login`)
          return
        }
        const d = await r.json() as { pages?: AppPage[] }
        const pg = d.pages ?? []
        setPages(pg)
        if (pg.length > 0) setActivePage(pg[0])
      } finally {
        setLoading(false)
      }
    }
    void loadPages()
  }, [tenantSlug, appSlug, router])

  async function logout() {
    await fetch(`/api/portal2/${tenantSlug}/${appSlug}/auth/logout`, { method: 'POST' })
    router.push(`/portal/${tenantSlug}/${appSlug}/login`)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ color: '#009A8A', fontSize: 15 }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f8fafc', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: '#009A8A', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{appSlug}</span>
        </div>
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {pages.length === 0 ? (
            <div style={{ padding: '12px 20px', color: '#94a3b8', fontSize: 13 }}>No pages yet</div>
          ) : (
            pages.map(p => (
              <button key={p.id} onClick={() => setActivePage(p)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 20px', background: activePage?.id === p.id ? '#f0fdf9' : 'transparent', color: activePage?.id === p.id ? '#009A8A' : '#475569', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activePage?.id === p.id ? 600 : 400, borderLeft: activePage?.id === p.id ? '3px solid #009A8A' : '3px solid transparent' }}>
                {p.name}
              </button>
            ))
          )}
        </nav>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={() => void logout()} style={{ width: '100%', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, padding: '7px', cursor: 'pointer', fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <header style={{ padding: '12px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{activePage?.name ?? 'Portal'}</h1>
        </header>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {pages.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <div style={{ color: '#cbd5e1', marginBottom: 16 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
              </div>
              <p style={{ color: '#64748b', fontSize: 15, marginBottom: 16 }}>No pages have been configured for this portal yet.</p>
              <a href={`/${tenantSlug}/builder`} style={{ color: '#009A8A', fontSize: 13, textDecoration: 'underline' }}>Configure pages in the builder</a>
            </div>
          ) : activePage ? (
            <div>
              {activePage.layout.map((comp, i) => (
                <div key={comp.id ?? i} style={{ marginBottom: 16 }}>
                  <RenderComponent comp={comp} tenantSlug={tenantSlug} appSlug={appSlug} />
                </div>
              ))}
              {activePage.layout.length === 0 && (
                <div style={{ color: '#94a3b8', textAlign: 'center', paddingTop: 40, fontSize: 14 }}>This page has no components yet. Add components in the builder.</div>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}