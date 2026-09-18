'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface NavItem { id: string; label: string; href: string; icon: string; section: string; sort_order: number; }
interface TableMeta { slug: string; label: string; color: string; }

const ICONS = [
  { value: 'layers', emoji: '📋' }, { value: 'table', emoji: '🗄' }, { value: 'users', emoji: '👥' },
  { value: 'package', emoji: '📦' }, { value: 'file-text', emoji: '📄' }, { value: 'bar-chart', emoji: '📊' },
  { value: 'shopping-cart', emoji: '🛒' }, { value: 'truck', emoji: '🚛' }, { value: 'receipt', emoji: '🧾' },
  { value: 'star', emoji: '⭐' }, { value: 'home', emoji: '🏠' }, { value: 'briefcase', emoji: '💼' },
  { value: 'database', emoji: '🗃' }, { value: 'heart', emoji: '❤️' }, { value: 'settings', emoji: '⚙️' },
];

function getEmoji(icon: string) { return ICONS.find(i => i.value === icon)?.emoji ?? '📋'; }

export default function NavBuilderPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [items, setItems] = useState<NavItem[]>([]);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<NavItem | null>(null);
  const [saved, setSaved] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const [navRes, tablesRes] = await Promise.all([
        fetch(`/api/platform/nav?tenant=${tenantSlug}`).then(r => r.json()),
        fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json()),
      ]);
      setItems(navRes.items ?? []);
      setTables(tablesRes.tables ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadItems(); }, [tenantSlug]);

  const deleteItem = async (id: string) => {
    if (!confirm('Remove this nav item?')) return;
    await fetch(`/api/platform/nav?tenant=${tenantSlug}&id=${id}`, { method: 'DELETE' });
    loadItems();
  };

  const moveItem = async (item: NavItem, dir: 'up' | 'down') => {
    const sectionItems = items.filter(i => i.section === item.section).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sectionItems.findIndex(i => i.id === item.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sectionItems.length) return;
    const swap = sectionItems[swapIdx];
    await Promise.all([
      fetch(`/api/platform/nav?tenant=${tenantSlug}&id=${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, sort_order: swap.sort_order }) }),
      fetch(`/api/platform/nav?tenant=${tenantSlug}&id=${swap.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...swap, sort_order: item.sort_order }) }),
    ]);
    loadItems();
  };

  const quickAdd = async (t: TableMeta) => {
    await fetch(`/api/platform/nav?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: t.label, href: `data/${t.slug}`, icon: 'table', section: 'main', sort_order: items.length }),
    });
    setSaved(true); setTimeout(() => setSaved(false), 4000);
    loadItems();
  };

  const mainItems = items.filter(i => i.section === 'main').sort((a, b) => a.sort_order - b.sort_order);
  const toolItems = items.filter(i => i.section === 'tools').sort((a, b) => a.sort_order - b.sort_order);

  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Navigation Builder</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Manage sidebar links — reload page after changes to see them in sidebar</p>
        </div>
        <button onClick={() => { setEditingItem(null); setShowForm(true); }} style={{ padding: '10px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ Add Link</button>
      </div>

      {saved && <div style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>✓ Saved — reload the page to see changes in the sidebar</div>}

      {/* Quick add from tables */}
      {tables.length > 0 && (
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
          <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Add — Your Tables</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {tables.map(t => {
              const alreadyAdded = items.some(i => i.href === `data/${t.slug}`);
              return (
                <button key={t.slug} disabled={alreadyAdded} onClick={() => quickAdd(t)}
                  style={{ padding: '6px 14px', border: `1px solid ${alreadyAdded ? '#e2e8f0' : '#6366f1'}`, borderRadius: '20px', backgroundColor: alreadyAdded ? '#f1f5f9' : '#eff6ff', color: alreadyAdded ? '#94a3b8' : '#4338ca', cursor: alreadyAdded ? 'default' : 'pointer', fontSize: '12px', fontWeight: '500' }}>
                  🗄 {t.label} {alreadyAdded ? '✓' : '+'}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: '48px' }}>Loading...</p> : (
        <>
          <NavSection title="Main Navigation" items={mainItems} onDelete={deleteItem} onMove={moveItem} onEdit={item => { setEditingItem(item); setShowForm(true); }} />
          <div style={{ height: '16px' }} />
          <NavSection title="Tools / Bottom" items={toolItems} onDelete={deleteItem} onMove={moveItem} onEdit={item => { setEditingItem(item); setShowForm(true); }} />
          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
              <p style={{ fontSize: '16px', marginBottom: '8px' }}>No custom nav items yet</p>
              <p style={{ fontSize: '13px' }}>Use Quick Add above or click "+ Add Link"</p>
            </div>
          )}
        </>
      )}

      {showForm && (
        <NavItemForm tenantSlug={tenantSlug} item={editingItem} icons={ICONS} tables={tables} inp={inp}
          onClose={() => { setShowForm(false); setEditingItem(null); }}
          onSaved={() => { setShowForm(false); setEditingItem(null); setSaved(true); setTimeout(() => setSaved(false), 4000); loadItems(); }} />
      )}
    </div>
  );
}

function NavSection({ title, items, onDelete, onMove, onEdit }: { title: string; items: NavItem[]; onDelete: (id: string) => void; onMove: (item: NavItem, dir: 'up' | 'down') => void; onEdit: (item: NavItem) => void; }) {
  return (
    <div>
      <p style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{title} ({items.length})</p>
      {items.length === 0 ? (
        <div style={{ padding: '16px', border: '1px dashed #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>No items in this section</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {items.map((item, idx) => (
            <div key={item.id} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>{getEmoji(item.icon)}</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: '600', color: '#0f172a', fontSize: '13px' }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>{item.href}</p>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => onMove(item, 'up')} disabled={idx === 0} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: idx === 0 ? 'not-allowed' : 'pointer', backgroundColor: '#fff', fontSize: '12px', opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                <button onClick={() => onMove(item, 'down')} disabled={idx === items.length - 1} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: idx === items.length - 1 ? 'not-allowed' : 'pointer', backgroundColor: '#fff', fontSize: '12px', opacity: idx === items.length - 1 ? 0.4 : 1 }}>↓</button>
                <button onClick={() => onEdit(item)} style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px' }}>Edit</button>
                <button onClick={() => onDelete(item.id)} style={{ padding: '4px 10px', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px', color: '#ef4444' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NavItemForm({ tenantSlug, item, icons, tables, inp, onClose, onSaved }: { tenantSlug: string; item: NavItem | null; icons: { value: string; emoji: string }[]; tables: TableMeta[]; inp: React.CSSProperties; onClose: () => void; onSaved: () => void; }) {
  const [label, setLabel] = useState(item?.label ?? '');
  const [href, setHref] = useState(item?.href ?? '');
  const [icon, setIcon] = useState(item?.icon ?? 'layers');
  const [section, setSection] = useState(item?.section ?? 'main');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!label.trim() || !href.trim()) { setError('Label and URL are required'); return; }
    setSaving(true);
    try {
      const url = item ? `/api/platform/nav?tenant=${tenantSlug}&id=${item.id}` : `/api/platform/nav?tenant=${tenantSlug}`;
      const r = await fetch(url, { method: item ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, href, icon, section, sort_order: item?.sort_order ?? 99 }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Failed'); return; }
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{item ? 'Edit Nav Link' : 'Add Nav Link'}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}>×</button>
        </div>
        {error && <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {tables.length > 0 && !item && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Quick Pick a Table</label>
              <select onChange={e => { const t = tables.find(t => t.slug === e.target.value); if (t) { setLabel(t.label); setHref(`data/${t.slug}`); setIcon('table'); } }} style={inp}>
                <option value="">— Choose a table —</option>
                {tables.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Label *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} style={inp} placeholder="e.g. Products, Employees" autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>URL Path *</label>
            <input value={href} onChange={e => setHref(e.target.value)} style={inp} placeholder="e.g. data/products" />
            <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>e.g. <code>data/products</code> or <code>custom/my-form</code></p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Icon</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {icons.map(ic => (
                <button key={ic.value} onClick={() => setIcon(ic.value)} style={{ width: '36px', height: '36px', border: `2px solid ${icon === ic.value ? '#6366f1' : '#e2e8f0'}`, borderRadius: '8px', cursor: 'pointer', backgroundColor: icon === ic.value ? '#eff6ff' : '#fff', fontSize: '18px' }}>{ic.emoji}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Section</label>
            <select value={section} onChange={e => setSection(e.target.value)} style={inp}>
              <option value="main">Main Navigation (top)</option>
              <option value="tools">Tools (bottom)</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '13px', fontWeight: '600' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: '600' }}>{saving ? 'Saving...' : item ? 'Update' : 'Add Link'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
