'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Widget { id: string; widget_type: string; title: string; config: Record<string, unknown>; grid_w: number; sort_order: number; }
interface TableMeta { id: string; slug: string; label: string; }
interface FieldMeta { slug: string; label: string; type: string; }

const WIDGET_TYPES = [
  { value: 'kpi', label: 'KPI Card', icon: '📊' },
  { value: 'chart', label: 'Bar Chart', icon: '📈' },
  { value: 'table', label: 'Recent Records', icon: '🗄' },
];

const AGGREGATES = [
  { value: 'count', label: 'Count rows' },
  { value: 'sum', label: 'Sum of field' },
  { value: 'avg', label: 'Average of field' },
  { value: 'max', label: 'Max of field' },
];

export default function DashboardBuilderClient({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wr, tr] = await Promise.all([
        fetch(`/api/platform/dashboard?tenant=${tenantSlug}`).then(r => r.json()),
        fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json()),
      ]);
      setWidgets(wr.widgets ?? []);
      setTables(tr.tables ?? []);
    } finally { setLoading(false); }
  }, [tenantSlug]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const deleteWidget = async (id: string) => {
    if (!confirm('Remove this widget?')) return;
    await fetch(`/api/platform/dashboard?tenant=${tenantSlug}&id=${id}`, { method: 'DELETE' });
    load();
  };

  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Dashboard Builder</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Add KPI cards, charts, and tables to your dashboard</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => router.push(`/${tenantSlug}/dashboard`)} style={{ padding: '9px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>← View Dashboard</button>
          <button onClick={() => { setEditingWidget(null); setShowForm(true); }} style={{ padding: '9px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ Add Widget</button>
        </div>
      </div>

      {saved && <div style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>✓ {saved}</div>}

      {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: '48px' }}>Loading...</p>
      : widgets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', border: '2px dashed #e2e8f0', borderRadius: '16px', color: '#94a3b8' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
          <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#0f172a' }}>No widgets yet</p>
          <p style={{ fontSize: '13px', marginBottom: '20px' }}>Add KPI cards, charts, and tables to track your data</p>
          <button onClick={() => setShowForm(true)} style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Add your first widget</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {widgets.map((w) => (
            <div key={w.id} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                {WIDGET_TYPES.find(t => t.value === w.widget_type)?.icon ?? '📊'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>{w.title}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
                  {WIDGET_TYPES.find(t => t.value === w.widget_type)?.label} · {(w.config as {table_slug?: string}).table_slug ? `ct_${(w.config as {table_slug?: string}).table_slug}` : 'No table'} · Width: {w.grid_w}/3
                </p>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => { setEditingWidget(w); setShowForm(true); }} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px' }}>Edit</button>
                <button onClick={() => deleteWidget(w.id)} style={{ padding: '6px 12px', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px', color: '#ef4444' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <WidgetForm tenantSlug={tenantSlug} widget={editingWidget} tables={tables} inp={inp}
          onClose={() => { setShowForm(false); setEditingWidget(null); }}
          onSaved={(msg) => { setShowForm(false); setEditingWidget(null); setSaved(msg); setTimeout(() => setSaved(''), 3000); load(); }} />
      )}
    </div>
  );
}

function WidgetForm({ tenantSlug, widget, tables, inp, onClose, onSaved }: {
  tenantSlug: string; widget: Widget | null; tables: TableMeta[]; inp: React.CSSProperties;
  onClose: () => void; onSaved: (msg: string) => void;
}) {
  const [type, setType] = useState(widget?.widget_type ?? 'kpi');
  const [title, setTitle] = useState(widget?.title ?? '');
  const [tableSlug, setTableSlug] = useState((widget?.config as {table_slug?: string})?.table_slug ?? '');
  const [aggregate, setAggregate] = useState((widget?.config as {aggregate?: string})?.aggregate ?? 'count');
  const [field, setField] = useState((widget?.config as {field?: string})?.field ?? '');
  const [xField, setXField] = useState((widget?.config as {x_field?: string})?.x_field ?? '');
  const [yField, setYField] = useState((widget?.config as {y_field?: string})?.y_field ?? '');
  const [gridW, setGridW] = useState(widget?.grid_w ?? 1);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<unknown>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!tableSlug) { setFields([]); return; }
    const t = tables.find(t => t.slug === tableSlug);
    if (!t) return;
    fetch(`/api/platform/fields?tenant=${tenantSlug}&tableId=${t.id}`)
      .then(r => r.json())
      .then(d => setFields((d.fields ?? []).filter((f: FieldMeta & {is_system: boolean}) => !f.is_system)));
  }, [tableSlug, tables, tenantSlug]);

  const loadPreview = async () => {
    if (!tableSlug) return;
    const config = type === 'kpi' ? { table_slug: tableSlug, aggregate, field }
      : type === 'chart' ? { table_slug: tableSlug, x_field: xField, y_field: yField, aggregate, limit: 5 }
      : { table_slug: tableSlug, limit: 3 };
    const r = await fetch(`/api/platform/dashboard/data?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widget_type: type, config }),
    });
    setPreview(await r.json());
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const config = type === 'kpi' ? { table_slug: tableSlug, aggregate, field }
        : type === 'chart' ? { table_slug: tableSlug, x_field: xField, y_field: yField, aggregate }
        : { table_slug: tableSlug, limit: 5 };
      const r = await fetch(`/api/platform/dashboard?tenant=${tenantSlug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: widget?.id, widget_type: type, title, config, grid_w: gridW, sort_order: widget?.sort_order ?? 99 }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Failed'); return; }
      onSaved(widget ? 'Widget updated' : 'Widget added — check the dashboard!');
    } finally { setSaving(false); }
  };

  const numericFields = fields.filter(f => ['number','decimal','currency','percent'].includes(f.type));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{widget ? 'Edit Widget' : 'Add Widget'}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}>×</button>
        </div>
        {error && <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Widget Type</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {WIDGET_TYPES.map(wt => (
                <button key={wt.value} onClick={() => setType(wt.value)} style={{ flex: 1, padding: '10px', border: `2px solid ${type === wt.value ? '#6366f1' : '#e2e8f0'}`, borderRadius: '8px', cursor: 'pointer', backgroundColor: type === wt.value ? '#eff6ff' : '#fff', color: type === wt.value ? '#4338ca' : '#374151', fontSize: '12px', fontWeight: type === wt.value ? '600' : '400' }}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{wt.icon}</div>
                  {wt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={inp} placeholder="e.g. Total Customers, Revenue by Category" autoFocus />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Data Source</label>
            <select value={tableSlug} onChange={e => setTableSlug(e.target.value)} style={inp}>
              <option value="">— Select a table —</option>
              {tables.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
            </select>
          </div>

          {type === 'kpi' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Calculation</label>
                <select value={aggregate} onChange={e => setAggregate(e.target.value)} style={inp}>
                  {AGGREGATES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              {aggregate !== 'count' && numericFields.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Field</label>
                  <select value={field} onChange={e => setField(e.target.value)} style={inp}>
                    <option value="">— Select field —</option>
                    {numericFields.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {type === 'chart' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Group By (X axis)</label>
                <select value={xField} onChange={e => setXField(e.target.value)} style={inp}>
                  <option value="">— Select field —</option>
                  {fields.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Calculation</label>
                <select value={aggregate} onChange={e => setAggregate(e.target.value)} style={inp}>
                  <option value="count">Count rows</option>
                  <option value="sum">Sum of field</option>
                </select>
              </div>
              {aggregate === 'sum' && numericFields.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Sum Field</label>
                  <select value={yField} onChange={e => setYField(e.target.value)} style={inp}>
                    <option value="">— Select field —</option>
                    {numericFields.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Width</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1,2,3].map(w => (
                <button key={w} onClick={() => setGridW(w)} style={{ flex: 1, padding: '8px', border: `2px solid ${gridW === w ? '#6366f1' : '#e2e8f0'}`, borderRadius: '8px', cursor: 'pointer', backgroundColor: gridW === w ? '#eff6ff' : '#fff', color: gridW === w ? '#4338ca' : '#374151', fontSize: '12px', fontWeight: gridW === w ? '600' : '400' }}>
                  {w === 1 ? '1/3' : w === 2 ? '2/3' : 'Full'} width
                </button>
              ))}
            </div>
          </div>

          {tableSlug && (
            <div>
              <button onClick={loadPreview} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px', fontWeight: '600', width: '100%' }}>👁 Preview data</button>
              {preview !== null && (
                <div style={{ marginTop: '8px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', fontSize: '12px' }}>
                  {type === 'kpi' && <div><strong>Value:</strong> {(preview as {value?: number})?.value?.toLocaleString() ?? '—'}</div>}
                  {type === 'chart' && ((preview as {labels?: string[]}).labels ?? []).map((label, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{label}</span><span style={{ fontWeight: '600' }}>{(preview as {values?: number[]}).values?.[i]?.toLocaleString()}</span>
                    </div>
                  ))}
                  {type === 'table' && <div><strong>{(preview as {rows?: unknown[]}).rows?.length ?? 0}</strong> recent records</div>}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
            <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '13px', fontWeight: '600' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: '600' }}>{saving ? 'Saving...' : widget ? 'Update' : 'Add Widget'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
