'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface TableMeta { id: string; slug: string; label: string; icon: string; color: string; description: string; field_count: number; }
interface FieldMeta { id: string; table_id: string; slug: string; label: string; type: string; options: Record<string, unknown>; is_required: boolean; is_unique: boolean; is_system: boolean; }

const FIELD_TYPES = [
  { value:'text', label:'Text' }, { value:'long_text', label:'Long Text' }, { value:'number', label:'Number' },
  { value:'decimal', label:'Decimal' }, { value:'currency', label:'Currency' }, { value:'percent', label:'Percent' },
  { value:'boolean', label:'Checkbox' }, { value:'date', label:'Date' }, { value:'datetime', label:'Date & Time' },
  { value:'select', label:'Select' }, { value:'multi_select', label:'Multi Select' }, { value:'email', label:'Email' },
  { value:'phone', label:'Phone' }, { value:'url', label:'URL' }, { value:'file', label:'File' },
  { value:'image', label:'Image' }, { value:'auto_number', label:'Auto Number' }, { value:'json', label:'JSON' },
];

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#64748b','#0f172a'];

export default function TableBuilderClient() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableMeta | null>(null);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTable, setShowNewTable] = useState(false);
  const [showNewField, setShowNewField] = useState(false);
  const [editingField, setEditingField] = useState<FieldMeta | null>(null);

  const loadTables = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`/api/platform/tables?tenant=${tenantSlug}`); const d = await r.json(); setTables(d.tables ?? []); }
    finally { setLoading(false); }
  }, [tenantSlug]);

  const loadFields = useCallback(async (tableId: string) => {
    const r = await fetch(`/api/platform/fields?tenant=${tenantSlug}&tableId=${tableId}`);
    const d = await r.json(); setFields(d.fields ?? []);
  }, [tenantSlug]);

  useEffect(() => { loadTables(); }, [loadTables]);
  useEffect(() => { if (selectedTable) loadFields(selectedTable.id); }, [selectedTable, loadFields]);

  const deleteTable = async (t: TableMeta) => {
    if (!confirm(`Delete table "${t.label}" and ALL its data?`)) return;
    await fetch(`/api/platform/tables?tenant=${tenantSlug}&tableId=${t.id}`, { method:'DELETE' });
    setSelectedTable(null); loadTables();
  };

  const deleteField = async (f: FieldMeta) => {
    if (!confirm(`Delete field "${f.label}"? All data in this field will be lost.`)) return;
    await fetch(`/api/platform/fields?tenant=${tenantSlug}&fieldId=${f.id}`, { method:'DELETE' });
    if (selectedTable) loadFields(selectedTable.id); loadTables();
  };

  const userFields = fields.filter(f => !f.is_system);
  const systemFields = fields.filter(f => f.is_system);

  const inp: React.CSSProperties = { width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', color:'#0f172a', boxSizing:'border-box', outline:'none', backgroundColor:'#fff' };
  const btn: React.CSSProperties = { padding:'8px 16px', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600' };

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'system-ui,sans-serif', fontSize:'13px' }}>
      {/* Left: Table List */}
      <div style={{ width:'260px', backgroundColor:'#0f172a', color:'#f1f5f9', display:'flex', flexDirection:'column', flexShrink:0, borderRight:'1px solid #1e293b' }}>
        <div style={{ padding:'16px', borderBottom:'1px solid #1e293b', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <p style={{ fontWeight:'700', fontSize:'14px', margin:0 }}>Table Builder</p>
            <p style={{ fontSize:'11px', color:'#64748b', margin:'2px 0 0' }}>{tables.length} tables</p>
          </div>
          <button onClick={() => setShowNewTable(true)} style={{ backgroundColor:'#6366f1', border:'none', color:'#fff', borderRadius:'6px', padding:'6px 12px', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>+ New</button>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:'8px' }}>
          {loading ? <p style={{ color:'#64748b', textAlign:'center', padding:'24px', fontSize:'12px' }}>Loading...</p>
          : tables.length === 0 ? (
            <div style={{ padding:'24px', textAlign:'center' }}>
              <p style={{ color:'#64748b', fontSize:'12px', marginBottom:'12px' }}>No tables yet</p>
              <button onClick={() => setShowNewTable(true)} style={{ backgroundColor:'#6366f1', border:'none', color:'#fff', borderRadius:'6px', padding:'8px 16px', cursor:'pointer', fontSize:'12px' }}>Create your first table</button>
            </div>
          ) : tables.map(t => (
            <div key={t.id} onClick={() => { setSelectedTable(t); setShowNewField(false); setEditingField(null); }}
              style={{ padding:'10px 12px', borderRadius:'8px', cursor:'pointer', marginBottom:'2px', backgroundColor:selectedTable?.id===t.id?'#1e293b':'transparent', display:'flex', alignItems:'center', gap:'10px' }}
              onMouseEnter={e => { if (selectedTable?.id!==t.id) (e.currentTarget as HTMLElement).style.backgroundColor='#1e293b'; }}
              onMouseLeave={e => { if (selectedTable?.id!==t.id) (e.currentTarget as HTMLElement).style.backgroundColor='transparent'; }}>
              <div style={{ width:'28px', height:'28px', borderRadius:'6px', backgroundColor:t.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', flexShrink:0 }}>🗄</div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:0, fontWeight:'600', color:'#f1f5f9', fontSize:'13px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.label}</p>
                <p style={{ margin:0, fontSize:'11px', color:'#64748b' }}>{t.field_count} fields</p>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteTable(t); }} style={{ border:'none', background:'none', color:'#64748b', cursor:'pointer', padding:'2px', fontSize:'14px' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color='#ef4444'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color='#64748b'}>🗑</button>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Field Editor */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', backgroundColor:'#f8fafc' }}>
        {!selectedTable ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'12px', color:'#94a3b8' }}>
            <div style={{ fontSize:'48px' }}>🗄️</div>
            <p style={{ fontSize:'16px', fontWeight:'600' }}>Select a table to edit its fields</p>
            <button onClick={() => setShowNewTable(true)} style={{ backgroundColor:'#6366f1', border:'none', color:'#fff', borderRadius:'8px', padding:'10px 20px', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>+ Create Table</button>
          </div>
        ) : (
          <>
            <div style={{ padding:'16px 24px', backgroundColor:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'12px' }}>
              <div style={{ width:'36px', height:'36px', borderRadius:'8px', backgroundColor:selectedTable.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px' }}>🗄</div>
              <div style={{ flex:1 }}>
                <h2 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'#0f172a' }}>{selectedTable.label}</h2>
                <p style={{ margin:0, fontSize:'11px', color:'#64748b' }}>ct_{selectedTable.slug} · {userFields.length} custom fields</p>
              </div>
              <button onClick={() => router.push(`/${tenantSlug}/data/${selectedTable.slug}`)} style={{ padding:'8px 16px', border:'1px solid #e2e8f0', borderRadius:'8px', backgroundColor:'#fff', cursor:'pointer', fontSize:'12px', fontWeight:'600', color:'#374151' }}>📊 View Data</button>
              <button onClick={() => setShowNewField(true)} style={{ padding:'8px 16px', border:'none', borderRadius:'8px', backgroundColor:'#6366f1', cursor:'pointer', fontSize:'12px', fontWeight:'600', color:'#fff' }}>+ Add Field</button>
            </div>

            <div style={{ flex:1, overflow:'auto', padding:'24px' }}>
              <p style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Custom Fields ({userFields.length})</p>
              {userFields.length === 0 ? (
                <div style={{ padding:'32px', textAlign:'center', border:'2px dashed #e2e8f0', borderRadius:'12px', color:'#94a3b8', marginBottom:'24px' }}>
                  <p style={{ fontSize:'14px', marginBottom:'8px' }}>No custom fields yet</p>
                  <button onClick={() => setShowNewField(true)} style={{ backgroundColor:'#6366f1', border:'none', color:'#fff', borderRadius:'6px', padding:'8px 16px', cursor:'pointer', fontSize:'12px' }}>Add your first field</button>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'4px', marginBottom:'24px' }}>
                  {userFields.map(f => (
                    <div key={f.id} style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px 16px', display:'flex', alignItems:'center', gap:'12px' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor='#6366f1'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor='#e2e8f0'}>
                      <div style={{ width:'32px', height:'32px', borderRadius:'6px', backgroundColor:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:'700', color:'#475569', flexShrink:0 }}>
                        {FIELD_TYPES.find(t => t.value===f.type)?.label.slice(0,2) ?? 'T'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                          <span style={{ fontWeight:'600', color:'#0f172a' }}>{f.label}</span>
                          {f.is_required && <span style={{ fontSize:'10px', backgroundColor:'#fee2e2', color:'#ef4444', padding:'1px 6px', borderRadius:'4px' }}>Required</span>}
                          {f.is_unique && <span style={{ fontSize:'10px', backgroundColor:'#eff6ff', color:'#3b82f6', padding:'1px 6px', borderRadius:'4px' }}>Unique</span>}
                        </div>
                        <div style={{ fontSize:'11px', color:'#64748b', marginTop:'2px' }}>
                          {FIELD_TYPES.find(t => t.value===f.type)?.label ?? f.type} · <code style={{ backgroundColor:'#f1f5f9', padding:'0 4px', borderRadius:'3px' }}>{f.slug}</code>
                        </div>
                      </div>
                      <button onClick={() => deleteField(f)} style={{ padding:'6px 10px', border:'1px solid #fecaca', borderRadius:'6px', backgroundColor:'#fff', cursor:'pointer', fontSize:'11px', color:'#ef4444' }}>Delete</button>
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontSize:'11px', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>System Fields</p>
              <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                {systemFields.map(f => (
                  <div key={f.id} style={{ backgroundColor:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'10px 16px', display:'flex', alignItems:'center', gap:'12px', opacity:0.7 }}>
                    <div style={{ width:'32px', height:'32px', borderRadius:'6px', backgroundColor:'#e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', color:'#94a3b8', flexShrink:0 }}>🔒</div>
                    <div>
                      <span style={{ fontWeight:'600', color:'#475569' }}>{f.label}</span>
                      <span style={{ fontSize:'11px', color:'#94a3b8', marginLeft:'8px' }}>{FIELD_TYPES.find(t => t.value===f.type)?.label ?? f.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* New Table Modal */}
      {showNewTable && <NewTableModal tenantSlug={tenantSlug} inp={inp} btn={btn} colors={COLORS} onClose={() => setShowNewTable(false)} onCreated={t => { loadTables(); setSelectedTable(t); setShowNewTable(false); }} />}

      {/* New Field Modal */}
      {(showNewField || editingField) && selectedTable && (
        <FieldModal tenantSlug={tenantSlug} tableId={selectedTable.id} existingField={editingField} fieldTypes={FIELD_TYPES} inp={inp} btn={btn}
          onClose={() => { setShowNewField(false); setEditingField(null); }}
          onSaved={() => { loadFields(selectedTable.id); loadTables(); setShowNewField(false); setEditingField(null); }} />
      )}
    </div>
  );
}

function NewTableModal({ tenantSlug, inp, btn, colors, onClose, onCreated }: { tenantSlug: string; inp: React.CSSProperties; btn: React.CSSProperties; colors: string[]; onClose: () => void; onCreated: (t: TableMeta) => void; }) {
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [description, setDescription] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const autoSlug = (l: string) => l.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);

  const handleSubmit = async () => {
    if (!label.trim() || !slug.trim()) { setError('Label and slug are required'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/platform/tables?tenant=${tenantSlug}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ label, slug, color, description }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Failed'); return; }
      onCreated(d.table);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(0,0,0,0.5)' }} />
      <div style={{ position:'relative', backgroundColor:'#fff', borderRadius:'16px', padding:'24px', width:'100%', maxWidth:'480px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'20px' }}>
          <h3 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'#0f172a' }}>Create New Table</h3>
          <button onClick={onClose} style={{ border:'none', background:'none', cursor:'pointer', fontSize:'20px', color:'#64748b' }}>×</button>
        </div>
        {error && <div style={{ backgroundColor:'#fee2e2', color:'#ef4444', padding:'10px', borderRadius:'8px', marginBottom:'16px', fontSize:'13px' }}>{error}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px', textTransform:'uppercase' }}>Color</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {colors.map(c => <div key={c} onClick={() => setColor(c)} style={{ width:'24px', height:'24px', borderRadius:'6px', backgroundColor:c, cursor:'pointer', border:color===c?'3px solid #0f172a':'3px solid transparent' }} />)}
            </div>
          </div>
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px', textTransform:'uppercase' }}>Table Name *</label>
            <input value={label} onChange={e => { setLabel(e.target.value); if (!slugEdited) setSlug(autoSlug(e.target.value)); }} style={inp} placeholder="e.g. Products, Employees, Invoices" autoFocus />
          </div>
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px', textTransform:'uppercase' }}>Slug *</label>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ color:'#94a3b8', fontSize:'12px' }}>ct_</span>
              <input value={slug} onChange={e => { setSlug(e.target.value); setSlugEdited(true); }} style={inp} placeholder="table_name" />
            </div>
            <p style={{ fontSize:'11px', color:'#94a3b8', marginTop:'4px' }}>Lowercase letters, numbers, underscores only</p>
          </div>
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px', textTransform:'uppercase' }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inp, resize:'vertical' }} rows={2} placeholder="What is this table for?" />
          </div>
          <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'8px' }}>
            <button onClick={onClose} style={{ ...btn, backgroundColor:'#f1f5f9', color:'#374151' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving} style={{ ...btn, backgroundColor:'#6366f1', color:'#fff' }}>{saving ? 'Creating...' : 'Create Table'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldModal({ tenantSlug, tableId, existingField, fieldTypes, inp, btn, onClose, onSaved }: { tenantSlug: string; tableId: string; existingField: FieldMeta | null; fieldTypes: {value:string;label:string}[]; inp: React.CSSProperties; btn: React.CSSProperties; onClose: () => void; onSaved: () => void; }) {
  const [label, setLabel] = useState(existingField?.label ?? '');
  const [slug, setSlug] = useState(existingField?.slug ?? '');
  const [type, setType] = useState(existingField?.type ?? 'text');
  const [isRequired, setIsRequired] = useState(existingField?.is_required ?? false);
  const [isUnique, setIsUnique] = useState(existingField?.is_unique ?? false);
  const [selectOptions, setSelectOptions] = useState<string[]>((existingField?.options as {choices?:string[]})?.choices ?? []);
  const [newOption, setNewOption] = useState('');
  const [slugEdited, setSlugEdited] = useState(!!existingField);
  const [relatedTable, setRelatedTable] = useState((existingField?.options as {related_table?: string})?.related_table ?? '');
  const [displayField, setDisplayField] = useState((existingField?.options as {display_field?: string})?.display_field ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const autoSlug = (l: string) => l.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

  const handleSubmit = async () => {
    if (!label.trim() || !slug.trim()) { setError('Label and slug are required'); return; }
    setSaving(true); setError('');
    try {
      const options = ['select','multi_select'].includes(type) ? { choices: selectOptions } : type === 'relation' ? { related_table: relatedTable, display_field: displayField } : {};
      const r = await fetch(`/api/platform/fields?tenant=${tenantSlug}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ tableId, slug, label, type, options, is_required:isRequired, is_unique:isUnique }) });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Failed'); return; }
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(0,0,0,0.5)' }} />
      <div style={{ position:'relative', backgroundColor:'#fff', borderRadius:'16px', padding:'24px', width:'100%', maxWidth:'520px', maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'20px' }}>
          <h3 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'#0f172a' }}>Add New Field</h3>
          <button onClick={onClose} style={{ border:'none', background:'none', cursor:'pointer', fontSize:'20px', color:'#64748b' }}>×</button>
        </div>
        {error && <div style={{ backgroundColor:'#fee2e2', color:'#ef4444', padding:'10px', borderRadius:'8px', marginBottom:'16px', fontSize:'13px' }}>{error}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px', textTransform:'uppercase' }}>Field Label *</label>
            <input value={label} onChange={e => { setLabel(e.target.value); if (!slugEdited) setSlug(autoSlug(e.target.value)); }} style={inp} placeholder="e.g. Product Name, Price, Status" autoFocus disabled={!!existingField} />
          </div>
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px', textTransform:'uppercase' }}>Field Key *</label>
            <input value={slug} onChange={e => { setSlug(e.target.value); setSlugEdited(true); }} style={inp} placeholder="product_name" disabled={!!existingField} />
            <p style={{ fontSize:'11px', color:'#94a3b8', marginTop:'4px' }}>Cannot be changed after creation.</p>
          </div>
          {!existingField && (
            <div>
              <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px', textTransform:'uppercase' }}>Field Type *</label>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px' }}>
                {fieldTypes.map(ft => (
                  <button key={ft.value} onClick={() => setType(ft.value)} style={{ padding:'8px', border:`1px solid ${type===ft.value?'#6366f1':'#e2e8f0'}`, borderRadius:'6px', cursor:'pointer', backgroundColor:type===ft.value?'#eff6ff':'#fff', color:type===ft.value?'#4338ca':'#374151', fontSize:'11px', fontWeight:type===ft.value?'600':'400' }}>
                    {ft.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {type === 'relation' && (
            <RelationConfig tenantSlug={tenantSlug} relatedTable={relatedTable} setRelatedTable={setRelatedTable} displayField={displayField} setDisplayField={setDisplayField} inp={inp} />
          )}
          {['select','multi_select'].includes(type) && (
            <div>
              <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px', textTransform:'uppercase' }}>Options</label>
              <div style={{ display:'flex', flexDirection:'column', gap:'4px', marginBottom:'8px' }}>
                {selectOptions.map((opt, i) => (
                  <div key={i} style={{ display:'flex', gap:'6px' }}>
                    <input value={opt} onChange={e => { const n=[...selectOptions]; n[i]=e.target.value; setSelectOptions(n); }} style={{ ...inp, flex:1 }} />
                    <button onClick={() => setSelectOptions(selectOptions.filter((_,j)=>j!==i))} style={{ border:'none', background:'none', cursor:'pointer', color:'#ef4444', fontSize:'16px' }}>×</button>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:'6px' }}>
                <input value={newOption} onChange={e => setNewOption(e.target.value)} onKeyDown={e => { if (e.key==='Enter' && newOption.trim()) { setSelectOptions([...selectOptions, newOption.trim()]); setNewOption(''); }}} style={{ ...inp, flex:1 }} placeholder="Add option..." />
                <button onClick={() => { if (newOption.trim()) { setSelectOptions([...selectOptions, newOption.trim()]); setNewOption(''); }}} style={{ ...btn, backgroundColor:'#6366f1', color:'#fff' }}>Add</button>
              </div>
            </div>
          )}
          <div style={{ display:'flex', gap:'16px' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'13px' }}><input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} /> Required</label>
            <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'13px' }}><input type="checkbox" checked={isUnique} onChange={e => setIsUnique(e.target.checked)} /> Unique</label>
          </div>
          <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'8px', borderTop:'1px solid #e2e8f0' }}>
            <button onClick={onClose} style={{ ...btn, backgroundColor:'#f1f5f9', color:'#374151' }}>Cancel</button>
            {!existingField && <button onClick={handleSubmit} disabled={saving} style={{ ...btn, backgroundColor:'#6366f1', color:'#fff' }}>{saving?'Adding...':'Add Field'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Relation Config Component ─────────────────────────────────────────────
function RelationConfig({ tenantSlug, relatedTable, setRelatedTable, displayField, setDisplayField, inp }: {
  tenantSlug: string; relatedTable: string; setRelatedTable: (v: string) => void;
  displayField: string; setDisplayField: (v: string) => void; inp: React.CSSProperties;
}) {
  const [tables, setTables] = React.useState<Array<{id: string; slug: string; label: string}>>([]);
  const [fields, setFields] = React.useState<Array<{slug: string; label: string}>>([]);

  React.useEffect(() => {
    fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json()).then(d => setTables(d.tables ?? []));
  }, [tenantSlug]);

  React.useEffect(() => {
    if (!relatedTable) { setFields([]); return; }
    const t = tables.find(t => t.slug === relatedTable);
    if (!t) return;
    fetch(`/api/platform/fields?tenant=${tenantSlug}&tableId=${t.id}`).then(r => r.json()).then(d => setFields((d.fields ?? []).filter((f: {is_system: boolean}) => !f.is_system)));
  }, [relatedTable, tables, tenantSlug]);

  return (
    <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#0369a1' }}>🔗 Relation Settings</p>
      <div>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Links to Table *</label>
        <select value={relatedTable} onChange={e => { setRelatedTable(e.target.value); setDisplayField(''); }} style={inp}>
          <option value="">— Select a table —</option>
          {tables.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
        </select>
      </div>
      {relatedTable && (
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Display Field (shown in picker)</label>
          <select value={displayField} onChange={e => setDisplayField(e.target.value)} style={inp}>
            <option value="">— Use ID —</option>
            {fields.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
          </select>
          <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Which field from the linked table shows as the label in this field's dropdown</p>
        </div>
      )}
    </div>
  );
}
