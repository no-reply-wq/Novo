'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface TableMeta { id: string; slug: string; label: string; color: string; }
interface FieldMeta { id: string; slug: string; label: string; type: string; options: Record<string, unknown>; is_system: boolean; is_required: boolean; }
interface Row { id: string; created_at: string; [key: string]: unknown; }

export default function DataGridPage() {
  const { tenantSlug, tableSlug } = useParams<{ tenantSlug: string; tableSlug: string }>();
  const router = useRouter();
  const [table, setTable] = useState<TableMeta | null>(null);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [tableId, setTableId] = useState('');
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [showNewRow, setShowNewRow] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');

  const visibleFields = fields.filter(f => !f.is_system || f.slug === 'created_at');
  const userFields = fields.filter(f => !f.is_system);
  const [resolvedRelations, setResolvedRelations] = useState<Record<string, Record<string, string>>>({});

  // Resolve relation field values to display names
  useEffect(() => {
    const relationFields = fields.filter(f => f.type === 'relation' && !f.is_system);
    if (!relationFields.length || !rows.length || !tableId) return;
    relationFields.forEach(async (rf) => {
      const ids = [...new Set(rows.map(r => r[rf.slug]).filter(Boolean))].join(',');
      if (!ids) return;
      const r = await fetch(`/api/platform/relations?tenant=${tenantSlug}&tableId=${tableId}&fieldSlug=${rf.slug}&ids=${ids}`);
      const d = await r.json();
      const map: Record<string, string> = {};
      (d.records ?? []).forEach((rec: {id: string; display_value: string}) => { map[rec.id] = rec.display_value; });
      setResolvedRelations(prev => ({ ...prev, [rf.slug]: map }));
    });
  }, [fields, rows, tableId, tenantSlug]);

  const loadData = useCallback(async (tid: string, p = 1, s = '') => {
    setLoading(true);
    try {
      const r = await fetch(`/api/platform/rows?tenant=${tenantSlug}&tableId=${tid}&page=${p}&pageSize=${pageSize}&search=${encodeURIComponent(s)}&sort=${sortField}&dir=${sortDir}`);
      const d = await r.json();
      if (d.error) { router.push(`/${tenantSlug}/table-builder`); return; }
      setTable(d.table); setFields(d.fields ?? []); setRows(d.rows ?? []); setTotal(d.total ?? 0);
    } finally { setLoading(false); }
  }, [tenantSlug, pageSize, sortField, sortDir, router]);

  useEffect(() => {
    fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json()).then(d => {
      const t = (d.tables ?? []).find((t: TableMeta) => t.slug === tableSlug);
      if (t) { setTableId(t.id); loadData(t.id, 1, ''); }
      else router.push(`/${tenantSlug}/table-builder`);
    });
  }, [tenantSlug, tableSlug, loadData, router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tableId) void loadData(tableId, page, search); }, [sortField, sortDir]);

  const deleteRows = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} row(s)?`)) return;
    await Promise.all(ids.map(rowId => fetch(`/api/platform/rows?tenant=${tenantSlug}&tableId=${tableId}&rowId=${rowId}`, { method: 'DELETE' })));
    setSelectedRows(new Set());
    loadData(tableId, page, search);
  };

  const toggleRow = (id: string) => { const s = new Set(selectedRows); s.has(id) ? s.delete(id) : s.add(id); setSelectedRows(s); };
  const toggleAll = () => setSelectedRows(selectedRows.size === rows.length ? new Set() : new Set(rows.map(r => r.id)));
  const pages = Math.ceil(total / pageSize);

  const fmt = (value: unknown, field: FieldMeta): string => {
    if (value === null || value === undefined) return '—';
    if (field.type === 'boolean') return value ? '✓' : '✗';
    if (field.type === 'datetime' || field.type === 'date') return value ? new Date(value as string).toLocaleDateString('en-IN') : '—';
    if (field.type === 'currency') return value ? `₹${Number(value).toLocaleString('en-IN')}` : '—';
    if (field.type === 'relation') {
      const resolved = resolvedRelations[field.slug]?.[String(value)];
      return resolved ?? (String(value).slice(0, 8) + '...');
    }
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', fontFamily:'system-ui,sans-serif', fontSize:'13px', backgroundColor:'#f8fafc' }}>
      <div style={{ backgroundColor:'#fff', borderBottom:'1px solid #e2e8f0', padding:'12px 24px', display:'flex', alignItems:'center', gap:'12px', flexShrink:0 }}>
        <button onClick={() => router.push(`/${tenantSlug}/table-builder`)} style={{ border:'1px solid #e2e8f0', borderRadius:'6px', padding:'6px 10px', cursor:'pointer', backgroundColor:'#fff', color:'#64748b', fontSize:'12px' }}>← Tables</button>
        {table && (
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <div style={{ width:'28px', height:'28px', borderRadius:'6px', backgroundColor:table.color, display:'flex', alignItems:'center', justifyContent:'center' }}>🗄</div>
            <div>
              <h2 style={{ margin:0, fontSize:'15px', fontWeight:'700', color:'#0f172a' }}>{table.label}</h2>
              <p style={{ margin:0, fontSize:'11px', color:'#64748b' }}>{total} rows</p>
            </div>
          </div>
        )}
        <div style={{ flex:1 }} />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); if (tableId) loadData(tableId, 1, e.target.value); }} placeholder="Search..." style={{ border:'1px solid #e2e8f0', borderRadius:'8px', padding:'7px 12px', fontSize:'13px', width:'200px', outline:'none' }} />
        {selectedRows.size > 0 && <button onClick={() => deleteRows([...selectedRows])} style={{ padding:'7px 14px', border:'1px solid #fecaca', borderRadius:'8px', backgroundColor:'#fff', color:'#ef4444', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>Delete {selectedRows.size}</button>}
        <button onClick={() => setShowNewRow(true)} style={{ padding:'7px 14px', border:'none', borderRadius:'8px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'12px', fontWeight:'600' }}>+ Add Row</button>
      </div>

      <div style={{ flex:1, overflow:'auto' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'200px', color:'#94a3b8' }}>Loading...</div>
        ) : rows.length === 0 && !search ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', height:'300px', gap:'12px', color:'#94a3b8' }}>
            <div style={{ fontSize:'40px' }}>📭</div>
            <p style={{ fontSize:'15px', fontWeight:'600' }}>No rows yet</p>
            <button onClick={() => setShowNewRow(true)} style={{ padding:'8px 20px', border:'none', borderRadius:'8px', backgroundColor:'#6366f1', color:'#fff', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>Add first row</button>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead style={{ position:'sticky', top:0, zIndex:10 }}>
              <tr style={{ backgroundColor:'#f1f5f9', borderBottom:'1px solid #e2e8f0' }}>
                <th style={{ width:'40px', padding:'10px 16px', textAlign:'center' }}>
                  <input type="checkbox" checked={selectedRows.size === rows.length && rows.length > 0} onChange={toggleAll} />
                </th>
                {visibleFields.map(f => (
                  <th key={f.id} onClick={() => { const d = sortField === f.slug && sortDir === 'desc' ? 'asc' : 'desc'; setSortField(f.slug); setSortDir(d); }} style={{ padding:'10px 16px', textAlign:'left', fontWeight:'600', color:'#475569', whiteSpace:'nowrap', cursor:'pointer', borderRight:'1px solid #e2e8f0' }}>
                    {f.label} {sortField === f.slug ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                ))}
                <th style={{ width:'100px', padding:'10px 16px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} style={{ backgroundColor: selectedRows.has(row.id) ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'10px 16px', textAlign:'center' }}>
                    <input type="checkbox" checked={selectedRows.has(row.id)} onChange={() => toggleRow(row.id)} />
                  </td>
                  {visibleFields.map(f => (
                    <td key={f.id} style={{ padding:'10px 16px', color:'#374151', borderRight:'1px solid #f1f5f9', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {f.type === 'boolean' ? <span>{row[f.slug] ? '✅' : '⬜'}</span> : f.type === 'select' ? <span style={{ padding:'2px 8px', borderRadius:'12px', backgroundColor:'#f1f5f9', fontSize:'11px' }}>{fmt(row[f.slug], f)}</span> : fmt(row[f.slug], f)}
                    </td>
                  ))}
                  <td style={{ padding:'10px 16px', textAlign:'right' }}>
                    <button onClick={() => setEditingRow(row)} style={{ padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:'4px', cursor:'pointer', backgroundColor:'#fff', fontSize:'11px', marginRight:'4px' }}>Edit</button>
                    <button onClick={() => deleteRows([row.id])} style={{ padding:'4px 8px', border:'1px solid #fecaca', borderRadius:'4px', cursor:'pointer', backgroundColor:'#fff', fontSize:'11px', color:'#ef4444' }}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div style={{ backgroundColor:'#fff', borderTop:'1px solid #e2e8f0', padding:'10px 24px', display:'flex', alignItems:'center', gap:'12px', flexShrink:0 }}>
          <span style={{ color:'#64748b', fontSize:'12px' }}>Showing {((page-1)*pageSize)+1}–{Math.min(page*pageSize,total)} of {total}</span>
          <div style={{ display:'flex', gap:'4px', marginLeft:'auto' }}>
            <button disabled={page===1} onClick={() => { setPage(p=>p-1); loadData(tableId,page-1,search); }} style={{ padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:page===1?'not-allowed':'pointer', backgroundColor:'#fff', opacity:page===1?0.5:1 }}>←</button>
            <span style={{ padding:'6px 12px', fontSize:'12px' }}>Page {page} of {pages}</span>
            <button disabled={page===pages} onClick={() => { setPage(p=>p+1); loadData(tableId,page+1,search); }} style={{ padding:'6px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:page===pages?'not-allowed':'pointer', backgroundColor:'#fff', opacity:page===pages?0.5:1 }}>→</button>
          </div>
        </div>
      )}

      {(showNewRow || editingRow) && tableId && (
        <RowModal tenantSlug={tenantSlug} tableId={tableId} fields={userFields} row={editingRow} tableName={table?.label ?? ''} onClose={() => { setShowNewRow(false); setEditingRow(null); }} onSaved={() => { setShowNewRow(false); setEditingRow(null); loadData(tableId, page, search); }} />
      )}
    </div>
  );
}

function RowModal({ tenantSlug, tableId, fields, row, tableName, onClose, onSaved }: { tenantSlug: string; tableId: string; fields: FieldMeta[]; row: Row | null; tableName: string; onClose: () => void; onSaved: () => void; }) {
  const [data, setData] = useState<Record<string, unknown>>(() => { const d: Record<string, unknown> = {}; fields.forEach(f => { d[f.slug] = row?.[f.slug] ?? ''; }); return d; });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (slug: string, value: unknown) => setData(d => ({ ...d, [slug]: value }));

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      const url = `/api/platform/rows?tenant=${tenantSlug}&tableId=${tableId}${row ? `&rowId=${row.id}` : ''}`;
      const r = await fetch(url, { method: row ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
      let d: Record<string, string> = {};
      try { d = await r.json(); } catch { d = { error: 'Server returned empty response' }; }
      if (!r.ok) { setError(d.error ?? 'Failed'); return; }
      onSaved();
    } finally { setSaving(false); }
  };

  const renderField = (f: FieldMeta) => {
    const val = data[f.slug];
    const choices = (f.options?.choices as string[]) ?? [];
    const inp: React.CSSProperties = { width:'100%', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', boxSizing:'border-box', outline:'none' };
    switch (f.type) {
      case 'long_text': return <textarea value={String(val??'')} onChange={e => set(f.slug, e.target.value)} style={{...inp, resize:'vertical'}} rows={3} />;
      case 'boolean': return <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}><input type="checkbox" checked={!!val} onChange={e => set(f.slug, e.target.checked)} /><span>Yes</span></label>;
      case 'select': return <select value={String(val??'')} onChange={e => set(f.slug, e.target.value)} style={inp}><option value="">— Select —</option>{choices.map(c => <option key={c} value={c}>{c}</option>)}</select>;
      case 'number': case 'decimal': case 'currency': case 'percent': return <input type="number" value={String(val??'')} onChange={e => set(f.slug, e.target.value)} style={inp} step={f.type==='decimal'||f.type==='currency'?'0.01':'1'} />;
      case 'date': return <input type="date" value={String(val??'')} onChange={e => set(f.slug, e.target.value)} style={inp} />;
      case 'datetime': return <input type="datetime-local" value={String(val??'')} onChange={e => set(f.slug, e.target.value)} style={inp} />;
      case 'relation': return <RelationPicker tenantSlug={tenantSlug} tableId={tableId} fieldSlug={f.slug} value={String(val??'')} onChange={v => set(f.slug, v)} inp={inp} />;
      default: return <input type={f.type==='email'?'email':f.type==='url'?'url':'text'} value={String(val??'')} onChange={e => set(f.slug, e.target.value)} style={inp} />;
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ position:'absolute', inset:0, backgroundColor:'rgba(0,0,0,0.5)' }} />
      <div style={{ position:'relative', backgroundColor:'#fff', borderRadius:'16px', padding:'24px', width:'100%', maxWidth:'540px', maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <h3 style={{ margin:0, fontSize:'16px', fontWeight:'700', color:'#0f172a' }}>{row ? 'Edit Row' : `New ${tableName} Row`}</h3>
          <button onClick={onClose} style={{ border:'none', background:'none', cursor:'pointer', fontSize:'20px', color:'#64748b' }}>×</button>
        </div>
        {error && <div style={{ backgroundColor:'#fee2e2', color:'#ef4444', padding:'10px', borderRadius:'8px', marginBottom:'16px', fontSize:'13px' }}>{error}</div>}
        {fields.length === 0 ? <p style={{ color:'#94a3b8', textAlign:'center', padding:'24px' }}>No fields defined. Add fields in the Table Builder first.</p> : (
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            {fields.map(f => (
              <div key={f.id}>
                <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.05em' }}>{f.label} {f.is_required && <span style={{ color:'#ef4444' }}>*</span>}</label>
                {renderField(f)}
              </div>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', paddingTop:'16px', marginTop:'16px', borderTop:'1px solid #e2e8f0' }}>
          <button onClick={onClose} style={{ padding:'8px 16px', border:'1px solid #e2e8f0', borderRadius:'8px', cursor:'pointer', backgroundColor:'#fff', fontSize:'13px', fontWeight:'600' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding:'8px 16px', border:'none', borderRadius:'8px', cursor:'pointer', backgroundColor:'#6366f1', color:'#fff', fontSize:'13px', fontWeight:'600' }}>{saving ? 'Saving...' : row ? 'Update' : 'Add Row'}</button>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ tenantSlug, tableId, tableName, onClose, onImported }: { tenantSlug: string; tableId: string; tableName: string; onClose: () => void; onImported: () => void; }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<{headers: string[]; columnMap: Record<string,string>; preview: Record<string,string>[]; totalRows: number; mappedCount: number; unmappedHeaders: string[]} | null>(null);
  const [importing, setSaving] = useState(false);
  const [result, setResult] = useState<{imported: number; errors: number; errorList: string[]} | null>(null);
  const [error, setError] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsv(ev.target?.result as string ?? '');
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!csv.trim()) { setError('Paste CSV or upload a file first'); return; }
    setError('');
    const r = await fetch(`/api/platform/import-export?tenant=${tenantSlug}&tableId=${tableId}&mode=preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
    const d = await r.json();
    if (!r.ok) { setError(d.error ?? 'Failed'); return; }
    setPreview(d);
  };

  const handleImport = async () => {
    setSaving(true); setError('');
    const r = await fetch(`/api/platform/import-export?tenant=${tenantSlug}&tableId=${tableId}&mode=import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { setError(d.error ?? 'Failed'); return; }
    setResult(d);
  };

  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', fontFamily: 'system-ui,sans-serif', fontSize: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>Import CSV → {tableName}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}>×</button>
        </div>
        {error && <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
        {result ? (
          <div>
            <div style={{ backgroundColor: result.errors === 0 ? '#d1fae5' : '#fef3c7', padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
              <p style={{ margin: '0 0 4px', fontWeight: '700', fontSize: '15px' }}>✓ Import complete</p>
              <p style={{ margin: 0, fontSize: '13px' }}>{result.imported} rows imported successfully{result.errors > 0 ? `, ${result.errors} failed` : ''}</p>
              {result.errorList.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: '16px', fontSize: '12px', color: '#92400e' }}>{result.errorList.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={onImported} style={{ padding: '8px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: '600' }}>Done</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Upload CSV File</label>
              <input type="file" accept=".csv" onChange={handleFile} style={{ ...inp, padding: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Or Paste CSV</label>
              <textarea value={csv} onChange={e => setCsv(e.target.value)} style={{ ...inp, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' }} rows={5} placeholder="name,email,phone&#10;John,john@example.com,9876543210" />
            </div>
            {preview && (
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '14px', fontSize: '12px' }}>
                <p style={{ margin: '0 0 8px', fontWeight: '700', color: '#0f172a' }}>Preview — {preview.totalRows} rows, {preview.mappedCount}/{preview.headers.length} columns matched</p>
                {preview.unmappedHeaders.length > 0 && <p style={{ margin: '0 0 8px', color: '#92400e', backgroundColor: '#fef3c7', padding: '6px 10px', borderRadius: '6px' }}>⚠ Not matched: {preview.unmappedHeaders.join(', ')}</p>}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%' }}>
                    <thead><tr style={{ backgroundColor: '#e2e8f0' }}>{preview.headers.map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: preview.columnMap[h] ? '#065f46' : '#94a3b8' }}>{h}{preview.columnMap[h] ? ` → ${preview.columnMap[h]}` : ' (skipped)'}</th>)}</tr></thead>
                    <tbody>{preview.preview.map((row, i) => <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>{preview.headers.map(h => <td key={h} style={{ padding: '4px 8px', color: '#374151' }}>{row[h] || '—'}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '13px', fontWeight: '600' }}>Cancel</button>
              {!preview ? (
                <button onClick={handlePreview} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: '600' }}>Preview</button>
              ) : (
                <button onClick={handleImport} disabled={importing} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#10b981', color: '#fff', fontSize: '13px', fontWeight: '600' }}>{importing ? 'Importing...' : `Import ${preview.totalRows} rows`}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Relation Picker ────────────────────────────────────────────────────────
function RelationPicker({ tenantSlug, tableId, fieldSlug, value, onChange, inp }: {
  tenantSlug: string; tableId: string; fieldSlug: string; value: string;
  onChange: (v: string) => void; inp: React.CSSProperties;
}) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Array<{id: string; display_value: string}>>([]);
  const [displayValue, setDisplayValue] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Resolve current value to display text
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!value) { setDisplayValue(''); return; }
    void fetch(`/api/platform/relations?tenant=${tenantSlug}&tableId=${tableId}&fieldSlug=${fieldSlug}&ids=${value}`)
      .then(r => r.json()).then(d => {
        const rec = (d.records ?? []).find((r: {id: string}) => r.id === value);
        setDisplayValue(rec?.display_value ?? value.slice(0, 8) + '...');
      });
  }, [value, tenantSlug, tableId, fieldSlug]);

  // Search related records
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void fetch(`/api/platform/relations?tenant=${tenantSlug}&tableId=${tableId}&fieldSlug=${fieldSlug}&search=${encodeURIComponent(search)}`)
      .then(r => r.json()).then(d => { setOptions(d.records ?? []); setLoading(false); });
  }, [search, open, tenantSlug, tableId, fieldSlug]);

  return (
    <div style={{ position: 'relative' }}>
      <div onClick={() => setOpen(!open)} style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}>
        <span style={{ color: value ? '#0f172a' : '#94a3b8' }}>{value ? displayValue || '...' : '— Select linked record —'}</span>
        <span style={{ fontSize: '10px', color: '#94a3b8' }}>▾</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginTop: '4px' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ width: '100%', border: 'none', borderBottom: '1px solid #e2e8f0', padding: '8px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ maxHeight: '200px', overflow: 'auto' }}>
            {value && (
              <div onClick={() => { onChange(''); setOpen(false); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>✕ Clear selection</div>
            )}
            {loading ? <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>Loading...</div>
            : options.length === 0 ? <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>No records found</div>
            : options.map(opt => (
              <div key={opt.id} onClick={() => { onChange(opt.id); setOpen(false); setSearch(''); }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#0f172a', backgroundColor: opt.id === value ? '#eff6ff' : '#fff', borderBottom: '1px solid #f8fafc' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = opt.id === value ? '#eff6ff' : '#fff'}>
                {opt.display_value || opt.id.slice(0, 12) + '...'}
                {opt.id === value && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#6366f1' }}>✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
