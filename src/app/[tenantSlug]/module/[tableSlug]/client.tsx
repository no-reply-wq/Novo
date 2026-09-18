'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────
interface TableMeta { id: string; slug: string; label: string; color: string; description: string; }
interface FieldMeta { id: string; slug: string; label: string; type: string; options: Record<string,unknown>; is_system: boolean; is_required: boolean; field_order: number; }
interface Row { id: string; created_at: string; [key: string]: unknown; }
interface FormField { field_slug: string; label: string; type: string; required: boolean; placeholder: string; options: string[]; width: 'full'|'half'; }
interface Workflow { id: string; name: string; trigger_type: string; actions: unknown[]; is_active: boolean; run_count: number; }
interface ReportCol { field_slug: string; label: string; aggregate: string; }
interface ReportFilter { field_slug: string; operator: string; value: string; }

const TABS = [
  { key: 'data',      label: '📊 Data',      title: 'Records' },
  { key: 'form',      label: '📋 Form',      title: 'Public Form' },
  { key: 'workflows', label: '⚡ Workflows', title: 'Automations' },
  { key: 'reports',   label: '📈 Reports',   title: 'Reports' },
  { key: 'schema',    label: '⚙️ Schema',    title: 'Fields' },
];

const TRIGGER_LABELS: Record<string,string> = { on_create:'On Create', on_update:'On Update', on_delete:'On Delete', on_field_change:'On Field Change' };
const FIELD_TYPES = ['text','long_text','number','decimal','currency','percent','boolean','date','datetime','select','multi_select','email','phone','url','file','image','auto_number','json'];
const AGGREGATES = ['none','count','sum','avg','min','max'];
const OPERATORS = [{v:'=',l:'='},{v:'!=',l:'≠'},{v:'>',l:'>'},{v:'<',l:'<'},{v:'contains',l:'contains'},{v:'is_empty',l:'is empty'}];

export default function ModulePageClient({ tenantSlug, tableSlug }: { tenantSlug: string; tableSlug: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<'data'|'form'|'workflows'|'reports'|'schema'>('data');
  const [table, setTable] = useState<TableMeta | null>(null);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [allTables, setAllTables] = useState<TableMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [tablesRes, fieldsRes] = await Promise.all([
      fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json()),
      fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json()), // placeholder
    ]);
    const tables: TableMeta[] = tablesRes.tables ?? [];
    setAllTables(tables);
    const t = tables.find(t => t.slug === tableSlug);
    if (!t) { router.push(`/${tenantSlug}/table-builder`); return; }
    setTable(t);
    const fr = await fetch(`/api/platform/fields?tenant=${tenantSlug}&tableId=${t.id}`).then(r => r.json());
    setFields(fr.fields ?? []);
    setLoading(false);
  }, [tenantSlug, tableSlug, router]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'system-ui,sans-serif', color:'#94a3b8' }}>Loading module...</div>;
  if (!table) return null;

  const userFields = fields.filter(f => !f.is_system);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'system-ui,sans-serif', fontSize:'13px' }}>

      {/* Left: Module list */}
      <div style={{ width:'200px', flexShrink:0, backgroundColor:'#0f172a', color:'#f1f5f9', display:'flex', flexDirection:'column', borderRight:'1px solid #1e293b' }}>
        <div style={{ padding:'12px', borderBottom:'1px solid #1e293b' }}>
          <p style={{ margin:0, fontSize:'11px', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Modules</p>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:'6px' }}>
          {allTables.map(t => (
            <div key={t.id} onClick={() => router.push(`/${tenantSlug}/module/${t.slug}`)}
              style={{ padding:'8px 10px', borderRadius:'6px', cursor:'pointer', marginBottom:'2px', backgroundColor:t.slug===tableSlug?'#1e293b':'transparent', display:'flex', alignItems:'center', gap:'8px' }}
              onMouseEnter={e => { if(t.slug!==tableSlug)(e.currentTarget as HTMLElement).style.backgroundColor='#1e293b'; }}
              onMouseLeave={e => { if(t.slug!==tableSlug)(e.currentTarget as HTMLElement).style.backgroundColor='transparent'; }}>
              <div style={{ width:'22px', height:'22px', borderRadius:'4px', backgroundColor:t.color, flexShrink:0 }} />
              <span style={{ fontSize:'12px', fontWeight:t.slug===tableSlug?'700':'400', color:'#f1f5f9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.label}</span>
            </div>
          ))}
          <div onClick={() => router.push(`/${tenantSlug}/table-builder`)}
            style={{ padding:'8px 10px', borderRadius:'6px', cursor:'pointer', marginTop:'8px', border:'1px dashed #334155', textAlign:'center' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor='#6366f1'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor='#334155'}>
            <span style={{ fontSize:'11px', color:'#64748b' }}>+ New Table</span>
          </div>
        </div>
      </div>

      {/* Right: Content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #e2e8f0', padding:'0 24px', display:'flex', alignItems:'center', gap:'0' }}>
          <div style={{ padding:'16px 0', marginRight:'24px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'8px', backgroundColor:table.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px' }}>��</div>
              <div>
                <h1 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'#0f172a' }}>{table.label}</h1>
                <p style={{ margin:0, fontSize:'11px', color:'#64748b' }}>ct_{table.slug} · {userFields.length} fields</p>
              </div>
            </div>
          </div>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              style={{ padding:'18px 16px', border:'none', borderBottom:`2px solid ${tab===t.key?'#6366f1':'transparent'}`, backgroundColor:'transparent', cursor:'pointer', fontSize:'13px', fontWeight:tab===t.key?'700':'400', color:tab===t.key?'#6366f1':'#64748b', whiteSpace:'nowrap', transition:'all 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {tab === 'data'      && <DataTab      tenantSlug={tenantSlug} table={table} fields={fields} />}
          {tab === 'form'      && <FormTab      tenantSlug={tenantSlug} table={table} fields={userFields} />}
          {tab === 'workflows' && <WorkflowsTab tenantSlug={tenantSlug} table={table} fields={userFields} allTables={allTables} />}
          {tab === 'reports'   && <ReportsTab   tenantSlug={tenantSlug} table={table} fields={userFields} />}
          {tab === 'schema'    && <SchemaTab    tenantSlug={tenantSlug} table={table} fields={fields} onRefresh={load} />}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 1: DATA GRID
// ══════════════════════════════════════════════════════════════════════════
function DataTab({ tenantSlug, table, fields }: { tenantSlug: string; table: TableMeta; fields: FieldMeta[]; }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const pageSize = 50;

  const visibleFields = fields.filter(f => !f.is_system || f.slug === 'created_at');
  const userFields = fields.filter(f => !f.is_system);

  const load = useCallback(async (p=1, s='') => {
    setLoading(true);
    try {
      const r = await fetch(`/api/platform/rows?tenant=${tenantSlug}&tableId=${table.id}&page=${p}&pageSize=${pageSize}&search=${encodeURIComponent(s)}&sort=${sortField}&dir=${sortDir}`);
      const d = await r.json();
      setRows(d.rows ?? []); setTotal(d.total ?? 0);
    } finally { setLoading(false); }
  }, [tenantSlug, table.id, sortField, sortDir]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { load(page, search); }, [sortField, sortDir]);

  const del = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} row(s)?`)) return;
    await Promise.all(ids.map(id => fetch(`/api/platform/rows?tenant=${tenantSlug}&tableId=${table.id}&rowId=${id}`, { method:'DELETE' })));
    setSelected(new Set()); load(page, search);
  };

  const toggleAll = () => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(r => r.id)));
  const pages = Math.ceil(total / pageSize);

  const fmt = (val: unknown, f: FieldMeta) => {
    if (val === null || val === undefined) return '—';
    if (f.type === 'boolean') return val ? '✅' : '⬜';
    if (f.type === 'currency') return `₹${Number(val).toLocaleString('en-IN')}`;
    if (f.type === 'date' || f.type === 'datetime') return val ? new Date(val as string).toLocaleDateString('en-IN') : '—';
    if (Array.isArray(val)) return val.join(', ');
    const s = String(val);
    return s.length > 50 ? s.slice(0,50) + '…' : s;
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding:'12px 24px', backgroundColor:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); load(1, e.target.value); }} placeholder="Search..." style={{ border:'1px solid #e2e8f0', borderRadius:'8px', padding:'7px 12px', fontSize:'13px', width:'200px', outline:'none' }} />
        <span style={{ fontSize:'12px', color:'#94a3b8', flex:1 }}>{total} rows{selected.size > 0 ? ` · ${selected.size} selected` : ''}</span>
        {selected.size > 0 && <button onClick={() => del([...selected])} style={{ padding:'7px 14px', border:'1px solid #fecaca', borderRadius:'8px', backgroundColor:'#fff', color:'#ef4444', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>Delete {selected.size}</button>}
        <button onClick={() => setShowImport(true)} style={{ padding:'7px 14px', border:'1px solid #e2e8f0', borderRadius:'8px', backgroundColor:'#fff', cursor:'pointer', fontSize:'12px' }}>⬆ Import</button>
        <a href={`/api/platform/import-export?tenant=${tenantSlug}&tableId=${table.id}`} style={{ padding:'7px 14px', border:'1px solid #e2e8f0', borderRadius:'8px', backgroundColor:'#fff', color:'#374151', cursor:'pointer', fontSize:'12px', textDecoration:'none' }}>⬇ Export</a>
        <button onClick={() => setShowNew(true)} style={{ padding:'7px 16px', border:'none', borderRadius:'8px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>+ Add Row</button>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflow:'auto' }}>
        {loading ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'200px', color:'#94a3b8' }}>Loading...</div>
        : rows.length === 0 ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', height:'300px', gap:'12px', color:'#94a3b8' }}>
            <div style={{ fontSize:'40px' }}>📭</div>
            <p style={{ fontSize:'15px', fontWeight:'600', color:'#0f172a' }}>No records yet</p>
            <button onClick={() => setShowNew(true)} style={{ padding:'8px 20px', border:'none', borderRadius:'8px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>Add first record</button>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead style={{ position:'sticky', top:0, zIndex:10 }}>
              <tr style={{ backgroundColor:'#f1f5f9', borderBottom:'1px solid #e2e8f0' }}>
                <th style={{ width:'40px', padding:'10px 16px', textAlign:'center' }}>
                  <input type="checkbox" checked={selected.size===rows.length&&rows.length>0} onChange={toggleAll} />
                </th>
                {visibleFields.map(f => (
                  <th key={f.id} onClick={() => { const d = sortField===f.slug&&sortDir==='desc'?'asc':'desc'; setSortField(f.slug); setSortDir(d); }}
                    style={{ padding:'10px 16px', textAlign:'left', fontWeight:'600', color:'#475569', whiteSpace:'nowrap', cursor:'pointer', borderRight:'1px solid #e2e8f0' }}>
                    {f.label} {sortField===f.slug ? (sortDir==='desc'?'↓':'↑') : ''}
                  </th>
                ))}
                <th style={{ width:'100px', padding:'10px 16px' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} style={{ backgroundColor:selected.has(row.id)?'#eff6ff':i%2===0?'#fff':'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'10px 16px', textAlign:'center' }}>
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => { const s=new Set(selected); s.has(row.id)?s.delete(row.id):s.add(row.id); setSelected(s); }} />
                  </td>
                  {visibleFields.map(f => (
                    <td key={f.id} style={{ padding:'10px 16px', color:'#374151', borderRight:'1px solid #f1f5f9', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {fmt(row[f.slug], f)}
                    </td>
                  ))}
                  <td style={{ padding:'10px 16px', textAlign:'right' }}>
                    <button onClick={() => setEditingRow(row)} style={{ padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:'4px', cursor:'pointer', backgroundColor:'#fff', fontSize:'11px', marginRight:'4px' }}>Edit</button>
                    <button onClick={() => del([row.id])} style={{ padding:'4px 8px', border:'1px solid #fecaca', borderRadius:'4px', cursor:'pointer', backgroundColor:'#fff', fontSize:'11px', color:'#ef4444' }}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ padding:'10px 24px', backgroundColor:'#fff', borderTop:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
          <span style={{ fontSize:'12px', color:'#64748b', flex:1 }}>Page {page} of {pages}</span>
          <button disabled={page===1} onClick={() => { setPage(p=>p-1); load(page-1,search); }} style={{ padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:page===1?'not-allowed':'pointer', backgroundColor:'#fff', opacity:page===1?0.5:1 }}>←</button>
          <button disabled={page===pages} onClick={() => { setPage(p=>p+1); load(page+1,search); }} style={{ padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:page===pages?'not-allowed':'pointer', backgroundColor:'#fff', opacity:page===pages?0.5:1 }}>→</button>
        </div>
      )}

      {/* Row Modal */}
      {(showNew || editingRow) && (
        <RowModal tenantSlug={tenantSlug} tableId={table.id} fields={userFields} row={editingRow}
          tableName={table.label}
          onClose={() => { setShowNew(false); setEditingRow(null); }}
          onSaved={() => { setShowNew(false); setEditingRow(null); load(page,search); }} />
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportModal tenantSlug={tenantSlug} tableId={table.id} tableName={table.label}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(page,search); }} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 2: FORM
// ══════════════════════════════════════════════════════════════════════════
function FormTab({ tenantSlug, table, fields }: { tenantSlug: string; table: TableMeta; fields: FieldMeta[]; }) {
  const [form, setForm] = useState<{id?:string; slug?:string; title:string; description:string; fields:FormField[]; settings:{success_message:string}; is_public:boolean} | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [editingIdx, setEditingIdx] = useState<number|null>(null);

  useEffect(() => {
    fetch(`/api/platform/forms?tenant=${tenantSlug}`)
      .then(r => r.json()).then(d => {
        const existing = (d.forms ?? []).find((f: {table_id: string}) => f.table_id === table.id);
        if (existing) {
          setForm({ id: existing.id, slug: existing.slug, title: existing.title, description: existing.description || '', fields: existing.fields || [], settings: existing.settings || { success_message: 'Thank you for your submission!' }, is_public: existing.is_public });
        } else {
          setForm({ title: table.label, description: '', fields: [], settings: { success_message: 'Thank you for your submission!' }, is_public: true });
        }
        setLoading(false);
      });
  }, [tenantSlug, table.id, table.label]);

  const autoGenerate = () => {
    if (!form) return;
    const generated: FormField[] = fields.filter(f => !['auto_number','relation'].includes(f.type)).map(f => ({
      field_slug: f.slug, label: f.label, type: f.type, required: f.is_required,
      placeholder: '', options: (f.options?.choices as string[]) ?? [], width: 'full',
    }));
    setForm({ ...form, fields: generated });
  };

  const addField = (f: FieldMeta) => {
    if (!form || form.fields.find(ff => ff.field_slug === f.slug)) return;
    setForm({ ...form, fields: [...form.fields, { field_slug: f.slug, label: f.label, type: f.type, required: f.is_required, placeholder: '', options: (f.options?.choices as string[]) ?? [], width: 'full' }] });
  };

  const removeField = (idx: number) => { if (!form) return; setForm({ ...form, fields: form.fields.filter((_,i) => i!==idx) }); };
  const updateField = (idx: number, updates: Partial<FormField>) => { if (!form) return; setForm({ ...form, fields: form.fields.map((f,i) => i===idx ? {...f,...updates} : f) }); };
  const moveField = (idx: number, dir: 'up'|'down') => {
    if (!form) return;
    const next = [...form.fields]; const swap = dir==='up'?idx-1:idx+1;
    if (swap<0||swap>=next.length) return;
    [next[idx],next[swap]]=[next[swap],next[idx]];
    setForm({ ...form, fields: next });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const r = await fetch(`/api/platform/forms?tenant=${tenantSlug}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: form.id, title: form.title, description: form.description, table_id: table.id, fields: form.fields, settings: form.settings, is_public: form.is_public }),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok) { setForm(f => f ? { ...f, id: d.form.id, slug: d.form.slug } : f); setSaved('Saved!'); setTimeout(() => setSaved(''), 2000); }
  };

  const publicUrl = form?.slug ? `${typeof window!=='undefined'?window.location.origin:''}/f/${form.slug}?tenant=${tenantSlug}` : '';
  const inp: React.CSSProperties = { width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box', outline:'none' };

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'200px', color:'#94a3b8' }}>Loading...</div>;
  if (!form) return null;

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* Left: Config */}
      <div style={{ width:'380px', flexShrink:0, borderRight:'1px solid #e2e8f0', backgroundColor:'#fff', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'13px', fontWeight:'700', color:'#0f172a', flex:1 }}>Form Builder</span>
          {saved && <span style={{ fontSize:'12px', color:'#10b981', fontWeight:'600' }}>✓ {saved}</span>}
          <button onClick={save} disabled={saving} style={{ padding:'7px 16px', border:'none', borderRadius:'8px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>{saving?'Saving...':'Save'}</button>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:'14px' }}>
          {/* Basic */}
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'4px', textTransform:'uppercase' }}>Form Title</label>
            <input value={form.title} onChange={e => setForm({...form, title:e.target.value})} style={inp} />
          </div>
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'4px', textTransform:'uppercase' }}>Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description:e.target.value})} style={{...inp, resize:'vertical'}} rows={2} placeholder="Optional" />
          </div>

          {/* Auto generate */}
          {form.fields.length === 0 && (
            <button onClick={autoGenerate} style={{ padding:'10px', border:'2px dashed #6366f1', borderRadius:'8px', backgroundColor:'#eff6ff', color:'#4338ca', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>✨ Auto-generate all fields</button>
          )}

          {/* Add fields */}
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'8px', textTransform:'uppercase' }}>Add Fields</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
              {fields.filter(f => !['auto_number','relation'].includes(f.type)).map(f => {
                const added = form.fields.some(ff => ff.field_slug === f.slug);
                return <button key={f.slug} onClick={() => added ? removeField(form.fields.findIndex(ff => ff.field_slug===f.slug)) : addField(f)}
                  style={{ padding:'3px 10px', border:`1px solid ${added?'#6366f1':'#e2e8f0'}`, borderRadius:'16px', cursor:'pointer', backgroundColor:added?'#eff6ff':'#fff', color:added?'#4338ca':'#374151', fontSize:'11px', fontWeight:added?'600':'400' }}>
                  {f.label} {added?'✓':'+'}
                </button>;
              })}
            </div>
          </div>

          {/* Fields list */}
          {form.fields.length > 0 && (
            <div>
              <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'8px', textTransform:'uppercase' }}>Fields ({form.fields.length})</label>
              <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                {form.fields.map((f, idx) => (
                  <div key={idx}>
                    <div style={{ backgroundColor:'#f8fafc', border:`1px solid ${editingIdx===idx?'#6366f1':'#e2e8f0'}`, borderRadius:'8px', padding:'8px 10px', display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }} onClick={() => setEditingIdx(editingIdx===idx?null:idx)}>
                      <div style={{ display:'flex', flexDirection:'column' }}>
                        <button onClick={e => { e.stopPropagation(); moveField(idx,'up'); }} disabled={idx===0} style={{ border:'none', background:'none', cursor:'pointer', fontSize:'9px', color:'#94a3b8', padding:'0', opacity:idx===0?0.3:1 }}>▲</button>
                        <button onClick={e => { e.stopPropagation(); moveField(idx,'down'); }} disabled={idx===form.fields.length-1} style={{ border:'none', background:'none', cursor:'pointer', fontSize:'9px', color:'#94a3b8', padding:'0', opacity:idx===form.fields.length-1?0.3:1 }}>▼</button>
                      </div>
                      <div style={{ flex:1 }}>
                        <p style={{ margin:0, fontWeight:'600', fontSize:'12px', color:'#0f172a' }}>{f.label} {f.required&&<span style={{color:'#ef4444'}}>*</span>}</p>
                        <p style={{ margin:0, fontSize:'10px', color:'#64748b' }}>{f.type} · {f.width} width</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeField(idx); }} style={{ border:'none', background:'none', cursor:'pointer', color:'#ef4444', fontSize:'16px' }}>×</button>
                    </div>
                    {editingIdx === idx && (
                      <div style={{ backgroundColor:'#fff', border:'1px solid #6366f1', borderRadius:'8px', padding:'10px', marginTop:'2px', display:'flex', flexDirection:'column', gap:'8px' }}>
                        <div><label style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', textTransform:'uppercase' }}>Label</label><input value={f.label} onChange={e => updateField(idx,{label:e.target.value})} style={{...inp,marginTop:'3px'}} /></div>
                        <div><label style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', textTransform:'uppercase' }}>Placeholder</label><input value={f.placeholder} onChange={e => updateField(idx,{placeholder:e.target.value})} style={{...inp,marginTop:'3px'}} /></div>
                        <div style={{ display:'flex', gap:'12px' }}>
                          <label style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', cursor:'pointer' }}><input type="checkbox" checked={f.required} onChange={e => updateField(idx,{required:e.target.checked})} /> Required</label>
                          <label style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', cursor:'pointer' }}>
                            <select value={f.width} onChange={e => updateField(idx,{width:e.target.value as 'full'|'half'})} style={{ border:'1px solid #e2e8f0', borderRadius:'4px', padding:'2px 4px', fontSize:'11px' }}><option value="full">Full</option><option value="half">Half</option></select>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          <div style={{ paddingTop:'12px', borderTop:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:'10px' }}>
            <div>
              <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'4px', textTransform:'uppercase' }}>Success Message</label>
              <input value={form.settings.success_message} onChange={e => setForm({...form, settings:{...form.settings, success_message:e.target.value}})} style={inp} />
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', cursor:'pointer' }}>
              <input type="checkbox" checked={form.is_public} onChange={e => setForm({...form, is_public:e.target.checked})} />
              Public — anyone with the link can submit
            </label>
            {form.slug && (
              <div style={{ backgroundColor:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'8px', padding:'10px' }}>
                <p style={{ margin:'0 0 6px', fontSize:'11px', fontWeight:'600', color:'#065f46' }}>🔗 Public Form URL</p>
                <p style={{ margin:'0 0 8px', fontSize:'11px', color:'#374151', wordBreak:'break-all' }}>{publicUrl}</p>
                <div style={{ display:'flex', gap:'6px' }}>
                  <button onClick={() => { navigator.clipboard.writeText(publicUrl); }} style={{ padding:'5px 12px', border:'none', borderRadius:'6px', backgroundColor:'#10b981', color:'#fff', cursor:'pointer', fontSize:'11px', fontWeight:'600' }}>Copy Link</button>
                  <a href={publicUrl} target="_blank" rel="noopener" style={{ padding:'5px 12px', border:'1px solid #bbf7d0', borderRadius:'6px', backgroundColor:'#fff', color:'#065f46', fontSize:'11px', fontWeight:'600', textDecoration:'none' }}>Preview ↗</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Live preview */}
      <div style={{ flex:1, backgroundColor:'#f8fafc', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'10px 20px', borderBottom:'1px solid #e2e8f0', backgroundColor:'#fff', fontSize:'12px', fontWeight:'600', color:'#64748b' }}>Live Preview</div>
        <div style={{ flex:1, overflow:'auto', padding:'24px', display:'flex', justifyContent:'center' }}>
          <div style={{ maxWidth:'520px', width:'100%', backgroundColor:'#fff', borderRadius:'16px', overflow:'hidden', boxShadow:'0 4px 24px rgba(0,0,0,0.08)' }}>
            <div style={{ backgroundColor:'#6366f1', padding:'24px 28px' }}>
              <h2 style={{ margin:'0 0 6px', fontSize:'20px', fontWeight:'800', color:'#fff' }}>{form.title||'Untitled Form'}</h2>
              {form.description && <p style={{ margin:0, fontSize:'13px', color:'rgba(255,255,255,0.8)' }}>{form.description}</p>}
            </div>
            <div style={{ padding:'24px 28px' }}>
              {form.fields.length === 0 ? <p style={{ color:'#94a3b8', textAlign:'center', padding:'24px', fontSize:'13px' }}>Add fields from the left panel</p> : (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
                  {form.fields.map((f,i) => (
                    <div key={i} style={{ gridColumn:f.width==='half'?'span 1':'span 2' }}>
                      <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'#374151', marginBottom:'5px' }}>{f.label}{f.required&&<span style={{color:'#ef4444'}}> *</span>}</label>
                      {f.type==='long_text' ? <textarea style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box', resize:'vertical' }} rows={3} placeholder={f.placeholder} readOnly />
                      : f.type==='boolean' ? <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px' }}><input type="checkbox" readOnly /> Yes</label>
                      : f.type==='select' ? <select style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px' }}><option>— Select —</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>
                      : f.type==='date' ? <input type="date" style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box' }} readOnly />
                      : (f.type==='file'||f.type==='image') ? <div style={{ border:'2px dashed #e2e8f0', borderRadius:'8px', padding:'16px', textAlign:'center', backgroundColor:'#f8fafc' }}><p style={{ margin:0, fontSize:'12px', color:'#94a3b8' }}>📎 Upload {f.type}</p></div>
                      : <input style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box' }} placeholder={f.placeholder} readOnly />}
                    </div>
                  ))}
                  <div style={{ gridColumn:'span 2' }}>
                    <button style={{ width:'100%', padding:'12px', border:'none', borderRadius:'10px', backgroundColor:'#6366f1', color:'#fff', fontSize:'14px', fontWeight:'700', cursor:'default' }}>Submit</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 3: WORKFLOWS
// ══════════════════════════════════════════════════════════════════════════
function WorkflowsTab({ tenantSlug, table, fields, allTables }: { tenantSlug: string; table: TableMeta; fields: FieldMeta[]; allTables: TableMeta[]; }) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [logs, setLogs] = useState<Array<{id:string;workflow_id:string;status:string;ran_at:string;error:string}>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingWf, setEditingWf] = useState<Workflow|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/platform/workflows?tenant=${tenantSlug}`).then(r => r.json());
    setWorkflows((r.workflows ?? []).filter((w: Workflow & {table_id: string}) => w.table_id === table.id));
    setLogs((r.logs ?? []).filter((l: {workflow_id: string}) => (r.workflows ?? []).filter((w: Workflow & {table_id: string}) => w.table_id === table.id).some((w: Workflow) => w.id === l.workflow_id)));
    setLoading(false);
  }, [tenantSlug, table.id]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (wf: Workflow) => {
    await fetch(`/api/platform/workflows?tenant=${tenantSlug}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...wf, table_id:table.id, is_active:!wf.is_active}) });
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Delete workflow?')) return;
    await fetch(`/api/platform/workflows?tenant=${tenantSlug}&workflowId=${id}`, { method:'DELETE' });
    load();
  };

  return (
    <div style={{ padding:'24px', overflow:'auto', height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' }}>
        <h2 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'#0f172a' }}>Automations for {table.label}</h2>
        <button onClick={() => { setEditingWf(null); setShowForm(true); }} style={{ padding:'8px 16px', border:'none', borderRadius:'8px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>+ New Workflow</button>
      </div>

      {loading ? <p style={{ color:'#94a3b8' }}>Loading...</p>
      : workflows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px', border:'2px dashed #e2e8f0', borderRadius:'12px', color:'#94a3b8' }}>
          <div style={{ fontSize:'40px', marginBottom:'12px' }}>⚡</div>
          <p style={{ fontSize:'15px', fontWeight:'600', color:'#0f172a', marginBottom:'8px' }}>No automations yet</p>
          <p style={{ fontSize:'13px', marginBottom:'16px' }}>Auto-send webhooks, update fields, create records when data changes</p>
          <button onClick={() => setShowForm(true)} style={{ padding:'8px 20px', border:'none', borderRadius:'8px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>Create first workflow</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'24px' }}>
          {workflows.map(wf => (
            <div key={wf.id} style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px', opacity:wf.is_active?1:0.6 }}>
              <span style={{ fontSize:'20px' }}>⚡</span>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <p style={{ margin:0, fontWeight:'700', fontSize:'13px', color:'#0f172a' }}>{wf.name}</p>
                  <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'12px', backgroundColor:wf.is_active?'#d1fae5':'#f1f5f9', color:wf.is_active?'#065f46':'#94a3b8', fontWeight:'600' }}>{wf.is_active?'Active':'Paused'}</span>
                </div>
                <p style={{ margin:0, fontSize:'11px', color:'#64748b' }}>{TRIGGER_LABELS[wf.trigger_type]} · {wf.actions?.length??0} action(s) · ran {wf.run_count} times</p>
              </div>
              <button onClick={() => toggle(wf)} style={{ padding:'5px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:'pointer', backgroundColor:'#fff', fontSize:'11px', fontWeight:'600', color:wf.is_active?'#f97316':'#10b981' }}>{wf.is_active?'Pause':'Resume'}</button>
              <button onClick={() => { setEditingWf(wf); setShowForm(true); }} style={{ padding:'5px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:'pointer', backgroundColor:'#fff', fontSize:'11px' }}>Edit</button>
              <button onClick={() => del(wf.id)} style={{ padding:'5px 10px', border:'1px solid #fecaca', borderRadius:'6px', cursor:'pointer', backgroundColor:'#fff', fontSize:'11px', color:'#ef4444' }}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {/* Recent logs */}
      {logs.length > 0 && (
        <div>
          <p style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'8px' }}>Recent Runs</p>
          <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
            {logs.slice(0,10).map(log => (
              <div key={log.id} style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'10px 14px', display:'flex', alignItems:'center', gap:'10px' }}>
                <span>{log.status==='success'?'✅':'❌'}</span>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0, fontSize:'12px', color:'#374151' }}>{workflows.find(w=>w.id===log.workflow_id)?.name ?? log.workflow_id}</p>
                  {log.error && <p style={{ margin:0, fontSize:'11px', color:'#ef4444' }}>{log.error}</p>}
                </div>
                <span style={{ fontSize:'11px', color:'#94a3b8' }}>{new Date(log.ran_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <SimpleWorkflowModal tenantSlug={tenantSlug} tableId={table.id} tableName={table.label} workflow={editingWf} fields={fields} allTables={allTables}
          onClose={() => { setShowForm(false); setEditingWf(null); }}
          onSaved={() => { setShowForm(false); setEditingWf(null); load(); }} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 4: REPORTS
// ══════════════════════════════════════════════════════════════════════════
function ReportsTab({ tenantSlug, table, fields }: { tenantSlug: string; table: TableMeta; fields: FieldMeta[]; }) {
  const [cols, setCols] = useState<ReportCol[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [groupBy, setGroupBy] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [limit, setLimit] = useState(500);
  const [results, setResults] = useState<Record<string,unknown>[]>([]);
  const [totals, setTotals] = useState<Record<string,unknown>>({});
  const [count, setCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [reportName, setReportName] = useState('');
  const [saved, setSaved] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  const run = useCallback(async () => {
    setRunning(true); setError('');
    try {
      const r = await fetch(`/api/platform/reports/run?tenant=${tenantSlug}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ table_id: table.id, table_slug: table.slug, columns: cols, filters, group_by: groupBy, sort_by: sortBy, sort_dir: sortDir, row_limit: limit }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error??'Failed'); return; }
      setResults(d.rows??[]); setTotals(d.totals??{}); setCount(d.count??0);
    } finally { setRunning(false); }
  }, [tenantSlug, table, cols, filters, groupBy, sortBy, sortDir, limit]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(run, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [run]);

  const addCol = (f: FieldMeta) => { if (cols.find(c=>c.field_slug===f.slug)) return; setCols(prev => [...prev, {field_slug:f.slug, label:f.label, aggregate:'none'}]); };
  const removeCol = (idx: number) => setCols(prev => prev.filter((_,i)=>i!==idx));
  const updateCol = (idx: number, agg: string) => setCols(prev => prev.map((c,i)=>i===idx?{...c,aggregate:agg}:c));
  const addFilter = () => setFilters(prev => [...prev, {field_slug:fields[0]?.slug??'', operator:'=', value:''}]);
  const removeFilter = (idx: number) => setFilters(prev => prev.filter((_,i)=>i!==idx));

  const saveReport = async () => {
    if (!reportName.trim()) { alert('Enter a report name'); return; }
    await fetch(`/api/platform/reports?tenant=${tenantSlug}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: reportName, table_id: table.id, columns: cols, filters, group_by: groupBy, sort_by: sortBy, sort_dir: sortDir, row_limit: limit }) });
    setSaved('Report saved!'); setTimeout(()=>setSaved(''), 2000);
  };

  const exportCSV = async () => {
    const r = await fetch(`/api/platform/reports/run?tenant=${tenantSlug}&format=csv`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ table_id:table.id, table_slug:table.slug, columns:cols, filters, group_by:groupBy, sort_by:sortBy, sort_dir:sortDir, row_limit:limit }) });
    const blob = await r.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${table.slug}_report.csv`; a.click();
  };

  const resultCols = results.length > 0 ? Object.keys(results[0]) : [];
  const inp: React.CSSProperties = { border:'1px solid #e2e8f0', borderRadius:'6px', padding:'5px 8px', fontSize:'12px', outline:'none', backgroundColor:'#fff' };

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* Config */}
      <div style={{ width:'300px', flexShrink:0, borderRight:'1px solid #e2e8f0', backgroundColor:'#fff', overflow:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
          <input value={reportName} onChange={e=>setReportName(e.target.value)} style={{...inp, flex:1}} placeholder="Report name..." />
          <button onClick={saveReport} style={{ padding:'5px 10px', border:'none', borderRadius:'6px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'11px', fontWeight:'600' }}>Save</button>
          {saved && <span style={{ fontSize:'11px', color:'#10b981' }}>✓</span>}
        </div>

        <Section2 title="📋 Columns">
          <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginBottom:'8px' }}>
            {fields.map(f => { const added=cols.some(c=>c.field_slug===f.slug); return <button key={f.slug} onClick={()=>added?removeCol(cols.findIndex(c=>c.field_slug===f.slug)):addCol(f)} style={{ padding:'2px 8px', border:`1px solid ${added?'#6366f1':'#e2e8f0'}`, borderRadius:'12px', cursor:'pointer', backgroundColor:added?'#eff6ff':'#fff', color:added?'#4338ca':'#374151', fontSize:'10px' }}>{f.label} {added?'✓':'+'}</button>; })}
          </div>
          {cols.map((c,idx) => (
            <div key={idx} style={{ display:'flex', alignItems:'center', gap:'4px', marginBottom:'4px' }}>
              <span style={{ flex:1, fontSize:'11px', color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.label}</span>
              <select value={c.aggregate} onChange={e=>updateCol(idx,e.target.value)} style={{...inp, padding:'2px 4px', fontSize:'10px'}}>
                {AGGREGATES.map(a=><option key={a} value={a}>{a==='none'?'as-is':a}</option>)}
              </select>
              <button onClick={()=>removeCol(idx)} style={{ border:'none', background:'none', cursor:'pointer', color:'#ef4444', fontSize:'14px' }}>×</button>
            </div>
          ))}
        </Section2>

        <Section2 title="🔍 Filters">
          {filters.map((f,idx) => (
            <div key={idx} style={{ display:'flex', gap:'3px', marginBottom:'4px', alignItems:'center' }}>
              <select value={f.field_slug} onChange={e=>setFilters(prev=>prev.map((ff,i)=>i===idx?{...ff,field_slug:e.target.value}:ff))} style={{...inp, flex:1, fontSize:'10px'}}>
                {fields.map(tf=><option key={tf.slug} value={tf.slug}>{tf.label}</option>)}
              </select>
              <select value={f.operator} onChange={e=>setFilters(prev=>prev.map((ff,i)=>i===idx?{...ff,operator:e.target.value}:ff))} style={{...inp, width:'60px', fontSize:'10px'}}>
                {OPERATORS.map(op=><option key={op.v} value={op.v}>{op.l}</option>)}
              </select>
              {!['is_empty','not_empty'].includes(f.operator) && <input value={f.value} onChange={e=>setFilters(prev=>prev.map((ff,i)=>i===idx?{...ff,value:e.target.value}:ff))} style={{...inp, width:'60px', fontSize:'10px'}} placeholder="value" />}
              <button onClick={()=>removeFilter(idx)} style={{ border:'none', background:'none', cursor:'pointer', color:'#ef4444', fontSize:'14px' }}>×</button>
            </div>
          ))}
          <button onClick={addFilter} style={{ padding:'4px 10px', border:'1px dashed #6366f1', borderRadius:'6px', cursor:'pointer', backgroundColor:'#fff', color:'#6366f1', fontSize:'10px', width:'100%' }}>+ Filter</button>
        </Section2>

        <Section2 title="📊 Group By">
          <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{...inp, width:'100%'}}>
            <option value="">— No grouping —</option>
            {fields.map(f=><option key={f.slug} value={f.slug}>{f.label}</option>)}
          </select>
        </Section2>

        <Section2 title="⚙️ Sort & Limit">
          <div style={{ display:'flex', gap:'4px', marginBottom:'6px' }}>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...inp, flex:1, fontSize:'11px'}}>
              <option value="created_at">Created At</option>
              {fields.map(f=><option key={f.slug} value={f.slug}>{f.label}</option>)}
            </select>
            <select value={sortDir} onChange={e=>setSortDir(e.target.value)} style={{...inp, width:'55px', fontSize:'11px'}}>
              <option value="desc">↓</option><option value="asc">↑</option>
            </select>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <span style={{ fontSize:'11px', color:'#64748b' }}>Max rows:</span>
            <input type="number" value={limit} onChange={e=>setLimit(parseInt(e.target.value)||500)} style={{...inp, width:'70px'}} min={1} max={1000} />
          </div>
        </Section2>
      </div>

      {/* Results */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'10px 16px', backgroundColor:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'13px', fontWeight:'600', color:'#0f172a', flex:1 }}>{running?'⏳ Running...': `${count} rows`}</span>
          <button onClick={run} disabled={running} style={{ padding:'6px 12px', border:'1px solid #6366f1', borderRadius:'6px', cursor:'pointer', backgroundColor:'#fff', color:'#6366f1', fontSize:'12px', fontWeight:'600' }}>▶ Run</button>
          {results.length > 0 && <button onClick={exportCSV} style={{ padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:'pointer', backgroundColor:'#fff', fontSize:'12px' }}>⬇ CSV</button>}
        </div>
        <div style={{ flex:1, overflow:'auto' }}>
          {error ? <div style={{ padding:'16px', color:'#ef4444', fontSize:'13px' }}>{error}</div>
          : results.length === 0 ? <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'200px', color:'#94a3b8', fontSize:'13px' }}>No results</div>
          : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead style={{ position:'sticky', top:0, zIndex:10 }}>
                <tr style={{ backgroundColor:'#f1f5f9', borderBottom:'2px solid #e2e8f0' }}>
                  {resultCols.map(c => <th key={c} style={{ padding:'8px 12px', textAlign:'left', fontWeight:'700', color:'#475569', whiteSpace:'nowrap', borderRight:'1px solid #e2e8f0' }}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {results.map((row,i) => (
                  <tr key={i} style={{ backgroundColor:i%2===0?'#fff':'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                    {resultCols.map(c => <td key={c} style={{ padding:'8px 12px', color:'#374151', borderRight:'1px solid #f1f5f9', whiteSpace:'nowrap', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis' }}>{row[c]==null?'—':String(row[c])}</td>)}
                  </tr>
                ))}
              </tbody>
              {Object.keys(totals).length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor:'#f1f5f9', borderTop:'2px solid #e2e8f0' }}>
                    {resultCols.map((c,i) => <td key={c} style={{ padding:'8px 12px', fontWeight:'700', color:'#0f172a', borderRight:'1px solid #e2e8f0' }}>{i===0?'TOTAL':totals[c]!==undefined?(totals[c] as number)?.toLocaleString():''}</td>)}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// TAB 5: SCHEMA (Field Editor)
// ══════════════════════════════════════════════════════════════════════════
function SchemaTab({ tenantSlug, table, fields, onRefresh }: { tenantSlug: string; table: TableMeta; fields: FieldMeta[]; onRefresh: () => void; }) {
  const [showAddField, setShowAddField] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newType, setNewType] = useState('text');
  const [newRequired, setNewRequired] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const userFields = fields.filter(f => !f.is_system);
  const systemFields = fields.filter(f => f.is_system);
  const autoSlug = (l: string) => l.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60);

  const addField = async () => {
    if (!newLabel.trim() || !newSlug.trim()) { setError('Label and slug required'); return; }
    setSaving(true); setError('');
    const r = await fetch(`/api/platform/fields?tenant=${tenantSlug}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ tableId:table.id, slug:newSlug, label:newLabel, type:newType, is_required:newRequired }),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { setError(d.error??'Failed'); return; }
    setNewLabel(''); setNewSlug(''); setNewType('text'); setNewRequired(false); setSlugEdited(false); setShowAddField(false);
    onRefresh();
  };

  const deleteField = async (fieldId: string, label: string) => {
    if (!confirm(`Delete field "${label}"? All data in this field will be lost.`)) return;
    await fetch(`/api/platform/fields?tenant=${tenantSlug}&fieldId=${fieldId}`, { method:'DELETE' });
    onRefresh();
  };

  const inp: React.CSSProperties = { width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box', outline:'none' };

  return (
    <div style={{ padding:'24px', overflow:'auto', height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' }}>
        <h2 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'#0f172a' }}>Fields — {table.label}</h2>
        <button onClick={() => setShowAddField(!showAddField)} style={{ padding:'8px 16px', border:'none', borderRadius:'8px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>+ Add Field</button>
      </div>

      {/* Add field form */}
      {showAddField && (
        <div style={{ backgroundColor:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:'12px', padding:'16px', marginBottom:'20px', display:'flex', flexDirection:'column', gap:'10px' }}>
          <p style={{ margin:0, fontSize:'12px', fontWeight:'700', color:'#0369a1' }}>New Field</p>
          {error && <p style={{ margin:0, fontSize:'12px', color:'#ef4444' }}>{error}</p>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
            <div>
              <label style={{ display:'block', fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'4px', textTransform:'uppercase' }}>Label *</label>
              <input value={newLabel} onChange={e => { setNewLabel(e.target.value); if(!slugEdited) setNewSlug(autoSlug(e.target.value)); }} style={inp} placeholder="Field Name" autoFocus />
            </div>
            <div>
              <label style={{ display:'block', fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'4px', textTransform:'uppercase' }}>Key *</label>
              <input value={newSlug} onChange={e => { setNewSlug(e.target.value); setSlugEdited(true); }} style={inp} placeholder="field_key" />
            </div>
            <div>
              <label style={{ display:'block', fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'4px', textTransform:'uppercase' }}>Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value)} style={inp}>
                {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', cursor:'pointer' }}><input type="checkbox" checked={newRequired} onChange={e => setNewRequired(e.target.checked)} /> Required</label>
            <div style={{ marginLeft:'auto', display:'flex', gap:'8px' }}>
              <button onClick={() => { setShowAddField(false); setError(''); }} style={{ padding:'7px 14px', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:'pointer', backgroundColor:'#fff', fontSize:'12px' }}>Cancel</button>
              <button onClick={addField} disabled={saving} style={{ padding:'7px 14px', border:'none', borderRadius:'6px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>{saving?'Adding...':'Add Field'}</button>
            </div>
          </div>
        </div>
      )}

      {/* User fields */}
      <p style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'8px' }}>Custom Fields ({userFields.length})</p>
      {userFields.length === 0 ? (
        <div style={{ padding:'24px', border:'2px dashed #e2e8f0', borderRadius:'10px', textAlign:'center', color:'#94a3b8', marginBottom:'16px' }}>
          No custom fields yet — click "+ Add Field"
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'4px', marginBottom:'20px' }}>
          {userFields.map(f => (
            <div key={f.id} style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px 16px', display:'flex', alignItems:'center', gap:'12px' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor='#6366f1'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor='#e2e8f0'}>
              <div style={{ width:'32px', height:'32px', borderRadius:'6px', backgroundColor:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:'700', color:'#475569', flexShrink:0 }}>{f.type.slice(0,3).toUpperCase()}</div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <span style={{ fontWeight:'600', color:'#0f172a' }}>{f.label}</span>
                  {f.is_required && <span style={{ fontSize:'10px', backgroundColor:'#fee2e2', color:'#ef4444', padding:'1px 6px', borderRadius:'4px' }}>Required</span>}
                </div>
                <div style={{ fontSize:'11px', color:'#64748b', marginTop:'2px' }}>{f.type} · <code style={{ backgroundColor:'#f1f5f9', padding:'0 4px', borderRadius:'3px' }}>{f.slug}</code></div>
              </div>
              <button onClick={() => deleteField(f.id, f.label)} style={{ padding:'5px 10px', border:'1px solid #fecaca', borderRadius:'6px', cursor:'pointer', backgroundColor:'#fff', fontSize:'11px', color:'#ef4444' }}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {/* System fields */}
      <p style={{ fontSize:'11px', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'8px' }}>System Fields (auto-managed)</p>
      <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
        {systemFields.map(f => (
          <div key={f.id} style={{ backgroundColor:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'10px 16px', display:'flex', alignItems:'center', gap:'12px', opacity:0.6 }}>
            <div style={{ width:'32px', height:'32px', borderRadius:'6px', backgroundColor:'#e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', flexShrink:0 }}>🔒</div>
            <div>
              <span style={{ fontWeight:'600', color:'#475569' }}>{f.label}</span>
              <span style={{ fontSize:'11px', color:'#94a3b8', marginLeft:'8px' }}>{f.type}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════════════════════════════════════
function Section2({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ margin:'0 0 6px', fontSize:'10px', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>{title}</p>
      {children}
    </div>
  );
}

function RowModal({ tenantSlug, tableId, fields, row, tableName, onClose, onSaved }: { tenantSlug: string; tableId: string; fields: FieldMeta[]; row: Row|null; tableName: string; onClose: ()=>void; onSaved: ()=>void; }) {
  const [data, setData] = useState<Record<string,unknown>>(() => { const d: Record<string,unknown>={}; fields.forEach(f=>{d[f.slug]=row?.[f.slug]??'';}); return d; });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (slug: string, val: unknown) => setData(d=>({...d,[slug]:val}));
  const inp: React.CSSProperties = { width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box', outline:'none' };

  const submit = async () => {
    setSaving(true); setError('');
    const url = `/api/platform/rows?tenant=${tenantSlug}&tableId=${tableId}${row?`&rowId=${row.id}`:''}`;
    const r = await fetch(url, { method:row?'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({data}) });
    let d: Record<string,string> = {};
    try { d = await r.json(); } catch { d = {error:'Server error'}; }
    setSaving(false);
    if (!r.ok) { setError(d.error??'Failed'); return; }
    onSaved();
  };

  const renderInput = (f: FieldMeta) => {
    const val = data[f.slug];
    const choices = (f.options?.choices as string[]) ?? [];
    switch(f.type) {
      case 'long_text': return <textarea value={String(val??'')} onChange={e=>set(f.slug,e.target.value)} style={{...inp,resize:'vertical'}} rows={3} />;
      case 'boolean': return <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer'}}><input type="checkbox" checked={!!val} onChange={e=>set(f.slug,e.target.checked)} /><span>Yes</span></label>;
      case 'select': return <select value={String(val??'')} onChange={e=>set(f.slug,e.target.value)} style={inp}><option value="">— Select —</option>{choices.map(c=><option key={c} value={c}>{c}</option>)}</select>;
      case 'number': case 'decimal': case 'currency': case 'percent': return <input type="number" value={String(val??'')} onChange={e=>set(f.slug,e.target.value)} style={inp} step={['decimal','currency'].includes(f.type)?'0.01':'1'} />;
      case 'date': return <input type="date" value={String(val??'')} onChange={e=>set(f.slug,e.target.value)} style={inp} />;
      case 'datetime': return <input type="datetime-local" value={String(val??'')} onChange={e=>set(f.slug,e.target.value)} style={inp} />;
      case 'email': return <input type="email" value={String(val??'')} onChange={e=>set(f.slug,e.target.value)} style={inp} />;
      case 'phone': return <input type="tel" value={String(val??'')} onChange={e=>set(f.slug,e.target.value)} style={inp} />;
      case 'url': return <input type="url" value={String(val??'')} onChange={e=>set(f.slug,e.target.value)} style={inp} />;
      default: return <input type="text" value={String(val??'')} onChange={e=>set(f.slug,e.target.value)} style={inp} />;
    }
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{position:'absolute',inset:0,backgroundColor:'rgba(0,0,0,0.5)'}} />
      <div style={{position:'relative',backgroundColor:'#fff',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'540px',maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'20px'}}>
          <h3 style={{margin:0,fontSize:'16px',fontWeight:'700',color:'#0f172a'}}>{row?'Edit Record':`New ${tableName} Record`}</h3>
          <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',fontSize:'20px',color:'#64748b'}}>×</button>
        </div>
        {error && <div style={{backgroundColor:'#fee2e2',color:'#ef4444',padding:'10px',borderRadius:'8px',marginBottom:'16px',fontSize:'13px'}}>{error}</div>}
        {fields.length===0 ? <p style={{color:'#94a3b8',textAlign:'center',padding:'24px'}}>No fields defined. Add fields in the Schema tab.</p> : (
          <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
            {fields.map(f=>(
              <div key={f.id}>
                <label style={{display:'block',fontSize:'11px',fontWeight:'600',color:'#64748b',marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.05em'}}>{f.label} {f.is_required&&<span style={{color:'#ef4444'}}>*</span>}</label>
                {renderInput(f)}
              </div>
            ))}
          </div>
        )}
        <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',paddingTop:'16px',marginTop:'16px',borderTop:'1px solid #e2e8f0'}}>
          <button onClick={onClose} style={{padding:'8px 16px',border:'1px solid #e2e8f0',borderRadius:'8px',cursor:'pointer',backgroundColor:'#fff',fontSize:'13px',fontWeight:'600'}}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{padding:'8px 16px',border:'none',borderRadius:'8px',cursor:'pointer',backgroundColor:'#6366f1',color:'#fff',fontSize:'13px',fontWeight:'600'}}>{saving?'Saving...':row?'Update':'Add Record'}</button>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ tenantSlug, tableId, tableName, onClose, onImported }: { tenantSlug: string; tableId: string; tableName: string; onClose: ()=>void; onImported: ()=>void; }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<{headers:string[];columnMap:Record<string,string>;preview:Record<string,string>[];totalRows:number;mappedCount:number}|null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{imported:number;errors:number}|null>(null);
  const [error, setError] = useState('');
  const inp: React.CSSProperties = { width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box', outline:'none' };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader(); reader.onload = ev => setCsv(ev.target?.result as string ?? ''); reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!csv.trim()) { setError('Upload or paste CSV first'); return; }
    setError('');
    const r = await fetch(`/api/platform/import-export?tenant=${tenantSlug}&tableId=${tableId}&mode=preview`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({csv}) });
    const d = await r.json();
    if (!r.ok) { setError(d.error??'Failed'); return; }
    setPreview(d);
  };

  const handleImport = async () => {
    setImporting(true);
    const r = await fetch(`/api/platform/import-export?tenant=${tenantSlug}&tableId=${tableId}&mode=import`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({csv}) });
    const d = await r.json();
    setImporting(false);
    if (!r.ok) { setError(d.error??'Failed'); return; }
    setResult(d);
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{position:'absolute',inset:0,backgroundColor:'rgba(0,0,0,0.5)'}} />
      <div style={{position:'relative',backgroundColor:'#fff',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'520px',maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',fontFamily:'system-ui,sans-serif',fontSize:'13px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'20px'}}>
          <h3 style={{margin:0,fontSize:'16px',fontWeight:'700',color:'#0f172a'}}>Import CSV → {tableName}</h3>
          <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',fontSize:'20px',color:'#64748b'}}>×</button>
        </div>
        {error && <div style={{backgroundColor:'#fee2e2',color:'#ef4444',padding:'10px',borderRadius:'8px',marginBottom:'16px',fontSize:'13px'}}>{error}</div>}
        {result ? (
          <div>
            <div style={{backgroundColor:result.errors===0?'#d1fae5':'#fef3c7',padding:'16px',borderRadius:'10px',marginBottom:'16px'}}>
              <p style={{margin:'0 0 4px',fontWeight:'700'}}>✓ Import complete</p>
              <p style={{margin:0,fontSize:'13px'}}>{result.imported} rows imported{result.errors>0?`, ${result.errors} failed`:''}</p>
            </div>
            <button onClick={onImported} style={{padding:'8px 20px',border:'none',borderRadius:'8px',cursor:'pointer',backgroundColor:'#6366f1',color:'#fff',fontSize:'13px',fontWeight:'600',width:'100%'}}>Done</button>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
            <div><label style={{display:'block',fontSize:'11px',fontWeight:'600',color:'#64748b',marginBottom:'4px',textTransform:'uppercase'}}>Upload CSV</label><input type="file" accept=".csv" onChange={handleFile} style={{...inp,padding:'6px'}} /></div>
            <div><label style={{display:'block',fontSize:'11px',fontWeight:'600',color:'#64748b',marginBottom:'4px',textTransform:'uppercase'}}>Or Paste CSV</label><textarea value={csv} onChange={e=>setCsv(e.target.value)} style={{...inp,fontFamily:'monospace',fontSize:'11px',resize:'vertical'}} rows={4} placeholder="name,email&#10;John,john@example.com" /></div>
            {preview && (
              <div style={{backgroundColor:'#f8fafc',borderRadius:'8px',padding:'12px',fontSize:'12px'}}>
                <p style={{margin:'0 0 6px',fontWeight:'700'}}>{preview.totalRows} rows · {preview.mappedCount}/{preview.headers.length} columns matched</p>
                <div style={{overflowX:'auto'}}>
                  <table style={{borderCollapse:'collapse',fontSize:'11px',width:'100%'}}>
                    <thead><tr style={{backgroundColor:'#e2e8f0'}}>{preview.headers.map(h=><th key={h} style={{padding:'3px 8px',textAlign:'left',color:preview.columnMap[h]?'#065f46':'#94a3b8'}}>{h}{preview.columnMap[h]?` → ${preview.columnMap[h]}`:' (skipped)'}</th>)}</tr></thead>
                    <tbody>{preview.preview.map((row,i)=><tr key={i}>{preview.headers.map(h=><td key={h} style={{padding:'3px 8px'}}>{row[h]||'—'}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
              <button onClick={onClose} style={{padding:'8px 16px',border:'1px solid #e2e8f0',borderRadius:'8px',cursor:'pointer',backgroundColor:'#fff',fontSize:'13px',fontWeight:'600'}}>Cancel</button>
              {!preview ? (
                <button onClick={handlePreview} style={{padding:'8px 16px',border:'none',borderRadius:'8px',cursor:'pointer',backgroundColor:'#6366f1',color:'#fff',fontSize:'13px',fontWeight:'600'}}>Preview</button>
              ) : (
                <button onClick={handleImport} disabled={importing} style={{padding:'8px 16px',border:'none',borderRadius:'8px',cursor:'pointer',backgroundColor:'#10b981',color:'#fff',fontSize:'13px',fontWeight:'600'}}>{importing?'Importing...':`Import ${preview.totalRows} rows`}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SimpleWorkflowModal({ tenantSlug, tableId, tableName, workflow, fields, allTables, onClose, onSaved }: { tenantSlug: string; tableId: string; tableName: string; workflow: Workflow|null; fields: FieldMeta[]; allTables: TableMeta[]; onClose: ()=>void; onSaved: ()=>void; }) {
  const [name, setName] = useState(workflow?.name??'');
  const [triggerType, setTriggerType] = useState(workflow?.trigger_type??'on_create');
  const [actionType, setActionType] = useState('webhook');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const inp: React.CSSProperties = { width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box', outline:'none' };

  const save = async () => {
    if (!name.trim()) { alert('Name required'); return; }
    setSaving(true);
    const actions = actionType==='webhook' && webhookUrl ? [{ type:'webhook', config:{ url:webhookUrl, include_row:true }}] : [];
    await fetch(`/api/platform/workflows?tenant=${tenantSlug}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:workflow?.id, name, table_id:tableId, trigger_type:triggerType, actions, is_active:true }) });
    setSaving(false); onSaved();
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{position:'absolute',inset:0,backgroundColor:'rgba(0,0,0,0.5)'}} />
      <div style={{position:'relative',backgroundColor:'#fff',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'480px',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',fontFamily:'system-ui,sans-serif',fontSize:'13px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'20px'}}>
          <h3 style={{margin:0,fontSize:'16px',fontWeight:'700',color:'#0f172a'}}>{workflow?'Edit Workflow':'New Workflow'} — {tableName}</h3>
          <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',fontSize:'20px',color:'#64748b'}}>×</button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          <div><label style={{display:'block',fontSize:'11px',fontWeight:'600',color:'#64748b',marginBottom:'6px',textTransform:'uppercase'}}>Name *</label><input value={name} onChange={e=>setName(e.target.value)} style={inp} placeholder="e.g. Notify on new record" autoFocus /></div>
          <div>
            <label style={{display:'block',fontSize:'11px',fontWeight:'600',color:'#64748b',marginBottom:'6px',textTransform:'uppercase'}}>Trigger</label>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>
              {Object.entries(TRIGGER_LABELS).map(([v,l]) => (
                <button key={v} onClick={()=>setTriggerType(v)} style={{padding:'8px',border:`2px solid ${triggerType===v?'#6366f1':'#e2e8f0'}`,borderRadius:'8px',cursor:'pointer',backgroundColor:triggerType===v?'#eff6ff':'#fff',color:triggerType===v?'#4338ca':'#374151',fontSize:'12px',fontWeight:triggerType===v?'600':'400',textAlign:'left' as const}}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{display:'block',fontSize:'11px',fontWeight:'600',color:'#64748b',marginBottom:'6px',textTransform:'uppercase'}}>Action</label>
            <select value={actionType} onChange={e=>setActionType(e.target.value)} style={{...inp,marginBottom:'8px'}}>
              <option value="webhook">Send Webhook</option>
              <option value="none">No action yet</option>
            </select>
            {actionType==='webhook' && <input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} style={inp} placeholder="https://hooks.zapier.com/..." />}
          </div>
          <div style={{backgroundColor:'#fef3c7',border:'1px solid #fde68a',borderRadius:'8px',padding:'10px',fontSize:'12px',color:'#92400e'}}>
            💡 Use <code style={{backgroundColor:'#fef9c3',padding:'1px 4px',borderRadius:'3px'}}>{'{{field_slug}}'}</code> in webhook URL or body to include row values. For advanced actions, use the full Workflow Builder.
          </div>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',paddingTop:'8px',borderTop:'1px solid #e2e8f0'}}>
            <button onClick={onClose} style={{padding:'8px 16px',border:'1px solid #e2e8f0',borderRadius:'8px',cursor:'pointer',backgroundColor:'#fff',fontSize:'13px',fontWeight:'600'}}>Cancel</button>
            <button onClick={save} disabled={saving} style={{padding:'8px 16px',border:'none',borderRadius:'8px',cursor:'pointer',backgroundColor:'#6366f1',color:'#fff',fontSize:'13px',fontWeight:'600'}}>{saving?'Saving...':'Save Workflow'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
