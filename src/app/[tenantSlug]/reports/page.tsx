'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';

interface Report { id: string; name: string; description: string; table_label: string; table_slug: string; table_id: string; columns: ReportColumn[]; filters: ReportFilter[]; group_by: string; sort_by: string; sort_dir: string; row_limit: number; }
interface ReportColumn { field_slug: string; label: string; aggregate: string; }
interface ReportFilter { field_slug: string; operator: string; value: string; }
interface TableMeta { id: string; slug: string; label: string; }
interface FieldMeta { slug: string; label: string; type: string; is_system: boolean; }

const AGGREGATES = ['none','count','sum','avg','min','max'];
const OPERATORS = [
  { value:'=', label:'equals' }, { value:'!=', label:'not equals' },
  { value:'>', label:'greater than' }, { value:'<', label:'less than' },
  { value:'>=', label:'>=' }, { value:'<=', label:'<=' },
  { value:'contains', label:'contains' }, { value:'starts', label:'starts with' },
  { value:'is_empty', label:'is empty' }, { value:'not_empty', label:'is not empty' },
];

const EMPTY_REPORT: Partial<Report> = { name:'', description:'', table_id:'', columns:[], filters:[], group_by:'', sort_by:'created_at', sort_dir:'desc', row_limit:500 };

export default function ReportsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [reports, setReports] = useState<Report[]>([]);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [selectedReport, setSelectedReport] = useState<Partial<Report> | null>(null);
  const [tableFields, setTableFields] = useState<FieldMeta[]>([]);
  const [results, setResults] = useState<Record<string,unknown>[]>([]);
  const [totals, setTotals] = useState<Record<string,unknown>>({});
  const [resultCount, setResultCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rr, tr] = await Promise.all([
      fetch(`/api/platform/reports?tenant=${tenantSlug}`).then(r => r.json()),
      fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json()),
    ]);
    setReports(rr.reports ?? []);
    setTables(tr.tables ?? []);
    setLoading(false);
  }, [tenantSlug]);

  useEffect(() => { load(); }, [load]);

  // Load fields when table changes
  useEffect(() => {
    if (!selectedReport?.table_id) { setTableFields([]); return; }
    fetch(`/api/platform/fields?tenant=${tenantSlug}&tableId=${selectedReport.table_id}`)
      .then(r => r.json()).then(d => setTableFields(d.fields ?? []));
  }, [selectedReport?.table_id, tenantSlug]);

  const runReport = useCallback(async (report: Partial<Report>) => {
    const table = tables.find(t => t.id === report.table_id);
    if (!table) return;
    setRunning(true); setError('');
    try {
      const r = await fetch(`/api/platform/reports/run?tenant=${tenantSlug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...report, table_slug: table.slug }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Failed'); return; }
      setResults(d.rows ?? []); setTotals(d.totals ?? {}); setResultCount(d.count ?? 0);
    } finally { setRunning(false); }
  }, [tenantSlug, tables]);

  // Auto-run with debounce when config changes
  useEffect(() => {
    if (!selectedReport?.table_id) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runReport(selectedReport), 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [selectedReport, runReport]);

  const newReport = () => {
    setSelectedReport({ ...EMPTY_REPORT, columns: [], filters: [] });
    setResults([]); setTotals({}); setResultCount(0);
  };

  const selectReport = (r: Report) => { setSelectedReport(r); setResults([]); setTotals({}); };

  const updateReport = (updates: Partial<Report>) => setSelectedReport(prev => prev ? { ...prev, ...updates } : null);

  const addColumn = (field: FieldMeta) => {
    if ((selectedReport?.columns ?? []).find(c => c.field_slug === field.slug)) return;
    updateReport({ columns: [...(selectedReport?.columns ?? []), { field_slug: field.slug, label: field.label, aggregate: 'none' }] });
  };

  const removeColumn = (idx: number) => updateReport({ columns: (selectedReport?.columns ?? []).filter((_, i) => i !== idx) });
  const updateColumn = (idx: number, updates: Partial<ReportColumn>) => updateReport({ columns: (selectedReport?.columns ?? []).map((c, i) => i === idx ? { ...c, ...updates } : c) });

  const addFilter = () => updateReport({ filters: [...(selectedReport?.filters ?? []), { field_slug: tableFields[0]?.slug ?? '', operator: '=', value: '' }] });
  const removeFilter = (idx: number) => updateReport({ filters: (selectedReport?.filters ?? []).filter((_, i) => i !== idx) });
  const updateFilter = (idx: number, updates: Partial<ReportFilter>) => updateReport({ filters: (selectedReport?.filters ?? []).map((f, i) => i === idx ? { ...f, ...updates } : f) });

  const saveReport = async () => {
    if (!selectedReport?.name?.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    const r = await fetch(`/api/platform/reports?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedReport),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { setError(d.error ?? 'Failed'); return; }
    setSaved('Saved!'); setTimeout(() => setSaved(''), 2000);
    updateReport({ id: d.report.id });
    load();
  };

  const deleteReport = async (id: string) => {
    if (!confirm('Delete this report?')) return;
    await fetch(`/api/platform/reports?tenant=${tenantSlug}&reportId=${id}`, { method: 'DELETE' });
    if (selectedReport?.id === id) setSelectedReport(null);
    load();
  };

  const exportCSV = async () => {
    const table = tables.find(t => t.id === selectedReport?.table_id);
    if (!table) return;
    const url = `/api/platform/reports/run?tenant=${tenantSlug}&format=csv`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selectedReport, table_slug: table.slug }) });
    const blob = await r.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${selectedReport?.name ?? 'report'}.csv`; a.click();
  };

  const inp: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none', backgroundColor: '#fff' };
  const resultCols = results.length > 0 ? Object.keys(results[0]) : [];
  const userFields = tableFields.filter(f => !f.is_system || f.slug === 'created_at');

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui,sans-serif', fontSize: '13px' }}>

      {/* Left: Reports List */}
      <div style={{ width: '240px', flexShrink: 0, backgroundColor: '#0f172a', color: '#f1f5f9', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e293b' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontWeight: '700', fontSize: '14px', margin: 0 }}>Reports</p>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 0' }}>{reports.length} saved</p>
          </div>
          <button onClick={newReport} style={{ backgroundColor: '#6366f1', border: 'none', color: '#fff', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>+ New</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {loading ? <p style={{ color: '#64748b', textAlign: 'center', padding: '24px', fontSize: '12px' }}>Loading...</p>
          : reports.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>No reports yet</p>
              <button onClick={newReport} style={{ backgroundColor: '#6366f1', border: 'none', color: '#fff', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '12px' }}>Create first report</button>
            </div>
          ) : reports.map(r => (
            <div key={r.id} onClick={() => selectReport(r)}
              style={{ padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px', backgroundColor: selectedReport?.id === r.id ? '#1e293b' : 'transparent', display: 'flex', alignItems: 'center', gap: '8px' }}
              onMouseEnter={e => { if (selectedReport?.id !== r.id) (e.currentTarget as HTMLElement).style.backgroundColor = '#1e293b'; }}
              onMouseLeave={e => { if (selectedReport?.id !== r.id) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>📊</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: '600', color: '#f1f5f9', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</p>
                <p style={{ margin: 0, fontSize: '10px', color: '#64748b' }}>{r.table_label || '—'}</p>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteReport(r.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: '14px', flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#ef4444'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#64748b'}>🗑</button>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Builder + Results */}
      {!selectedReport ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: '#94a3b8', backgroundColor: '#f8fafc' }}>
          <div style={{ fontSize: '48px' }}>📊</div>
          <p style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>Select or create a report</p>
          <button onClick={newReport} style={{ backgroundColor: '#6366f1', border: 'none', color: '#fff', borderRadius: '8px', padding: '10px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ New Report</button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Config Panel */}
          <div style={{ width: '340px', flexShrink: 0, borderRight: '1px solid #e2e8f0', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input value={selectedReport.name ?? ''} onChange={e => updateReport({ name: e.target.value })} style={{ ...inp, flex: 1, fontWeight: '700', fontSize: '14px' }} placeholder="Report name" />
              {saved && <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600', whiteSpace: 'nowrap' }}>✓ {saved}</span>}
              <button onClick={saveReport} disabled={saving} style={{ padding: '6px 14px', border: 'none', borderRadius: '6px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>{saving ? '...' : 'Save'}</button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {error && <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>{error}</div>}

              {/* Data Source */}
              <Section title="📦 Data Source">
                <select value={selectedReport.table_id ?? ''} onChange={e => updateReport({ table_id: e.target.value, columns: [], filters: [], group_by: '' })} style={{ ...inp, width: '100%' }}>
                  <option value="">— Select a table —</option>
                  {tables.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Section>

              {/* Columns */}
              {userFields.length > 0 && (
                <Section title="📋 Columns">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {userFields.map(f => {
                      const added = (selectedReport.columns ?? []).some(c => c.field_slug === f.slug);
                      return <button key={f.slug} onClick={() => added ? removeColumn((selectedReport.columns ?? []).findIndex(c => c.field_slug === f.slug)) : addColumn(f)}
                        style={{ padding: '3px 10px', border: `1px solid ${added ? '#6366f1' : '#e2e8f0'}`, borderRadius: '16px', cursor: 'pointer', backgroundColor: added ? '#eff6ff' : '#fff', color: added ? '#4338ca' : '#374151', fontSize: '11px', fontWeight: added ? '600' : '400' }}>
                        {f.label} {added ? '✓' : '+'}
                      </button>;
                    })}
                  </div>
                  {(selectedReport.columns ?? []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {(selectedReport.columns ?? []).map((col, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f8fafc', borderRadius: '6px', padding: '6px 8px' }}>
                          <span style={{ flex: 1, fontSize: '12px', fontWeight: '500', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
                          <select value={col.aggregate} onChange={e => updateColumn(idx, { aggregate: e.target.value })} style={{ ...inp, padding: '3px 6px', fontSize: '11px' }}>
                            {AGGREGATES.map(a => <option key={a} value={a}>{a === 'none' ? 'as-is' : a}</option>)}
                          </select>
                          <button onClick={() => removeColumn(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', padding: '0 2px' }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              )}

              {/* Filters */}
              {userFields.length > 0 && (
                <Section title="🔍 Filters">
                  {(selectedReport.filters ?? []).map((f, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '6px' }}>
                      <select value={f.field_slug} onChange={e => updateFilter(idx, { field_slug: e.target.value })} style={{ ...inp, flex: 1 }}>
                        {userFields.map(tf => <option key={tf.slug} value={tf.slug}>{tf.label}</option>)}
                      </select>
                      <select value={f.operator} onChange={e => updateFilter(idx, { operator: e.target.value })} style={{ ...inp, width: '90px' }}>
                        {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                      </select>
                      {!['is_empty','not_empty'].includes(f.operator) && (
                        <input value={f.value} onChange={e => updateFilter(idx, { value: e.target.value })} style={{ ...inp, width: '80px' }} placeholder="value" />
                      )}
                      <button onClick={() => removeFilter(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '16px' }}>×</button>
                    </div>
                  ))}
                  <button onClick={addFilter} style={{ padding: '5px 12px', border: '1px dashed #6366f1', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', color: '#6366f1', fontSize: '11px', fontWeight: '600', width: '100%' }}>+ Add Filter</button>
                </Section>
              )}

              {/* Group By */}
              {userFields.length > 0 && (
                <Section title="📊 Group By">
                  <select value={selectedReport.group_by ?? ''} onChange={e => updateReport({ group_by: e.target.value })} style={{ ...inp, width: '100%' }}>
                    <option value="">— No grouping —</option>
                    {userFields.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
                  </select>
                </Section>
              )}

              {/* Sort + Limit */}
              {userFields.length > 0 && (
                <Section title="⚙️ Sort & Limit">
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <select value={selectedReport.sort_by ?? 'created_at'} onChange={e => updateReport({ sort_by: e.target.value })} style={{ ...inp, flex: 1 }}>
                      <option value="created_at">Created At</option>
                      {userFields.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
                    </select>
                    <select value={selectedReport.sort_dir ?? 'desc'} onChange={e => updateReport({ sort_dir: e.target.value })} style={{ ...inp, width: '70px' }}>
                      <option value="desc">↓ Desc</option>
                      <option value="asc">↑ Asc</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>Max rows:</span>
                    <input type="number" value={selectedReport.row_limit ?? 500} onChange={e => updateReport({ row_limit: parseInt(e.target.value) || 500 })} style={{ ...inp, width: '80px' }} min={1} max={1000} />
                  </div>
                </Section>
              )}
            </div>
          </div>

          {/* Results Panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                {running ? '⏳ Running...' : `${resultCount} rows`}
              </span>
              <button onClick={() => runReport(selectedReport)} disabled={running || !selectedReport.table_id} style={{ padding: '6px 14px', border: '1px solid #6366f1', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', color: '#6366f1', fontSize: '12px', fontWeight: '600' }}>▶ Run</button>
              {results.length > 0 && <button onClick={exportCSV} style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', color: '#374151', fontSize: '12px' }}>⬇ Export CSV</button>}
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
              {error ? (
                <div style={{ padding: '24px' }}>
                  <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '12px 16px', borderRadius: '10px', fontSize: '13px' }}>{error}</div>
                </div>
              ) : results.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#94a3b8', flexDirection: 'column', gap: '8px' }}>
                  {!selectedReport.table_id ? <><div style={{ fontSize: '32px' }}>📊</div><p>Select a table to start</p></> : <><div style={{ fontSize: '32px' }}>📭</div><p>No results — try adjusting filters</p></>}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                      {resultCols.map(col => <th key={col} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', whiteSpace: 'nowrap', borderRight: '1px solid #e2e8f0' }}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, i) => (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#eff6ff'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = i % 2 === 0 ? '#fff' : '#f8fafc'}>
                        {resultCols.map(col => (
                          <td key={col} style={{ padding: '9px 14px', color: '#374151', borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row[col] === null || row[col] === undefined ? <span style={{ color: '#94a3b8' }}>—</span> : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {Object.keys(totals).length > 0 && (
                    <tfoot>
                      <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                        {resultCols.map((col, i) => (
                          <td key={col} style={{ padding: '10px 14px', fontWeight: '700', color: '#0f172a', borderRight: '1px solid #e2e8f0' }}>
                            {i === 0 ? 'TOTAL' : totals[col] !== undefined ? totals[col]?.toLocaleString() : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
      {children}
    </div>
  );
}
