'use client';
import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface Workflow { id: string; name: string; description: string; table_id?: string; table_label: string; table_slug: string; trigger_type: string; trigger_config: Record<string,unknown>; actions: Action[]; is_active: boolean; run_count: number; last_run_at: string; }
interface Action { type: string; config: Record<string,unknown>; }
interface Log { id: string; workflow_id: string; trigger_row_id: string; status: string; result: unknown; error: string; ran_at: string; }
interface TableMeta { id: string; slug: string; label: string; }
interface FieldMeta { slug: string; label: string; type: string; }

const TRIGGER_TYPES = [
  { value: 'on_create', label: 'When a record is created', icon: '➕' },
  { value: 'on_update', label: 'When a record is updated', icon: '✏️' },
  { value: 'on_delete', label: 'When a record is deleted', icon: '🗑' },
  { value: 'on_field_change', label: 'When a field value changes', icon: '🔄' },
];

const ACTION_TYPES = [
  { value: 'webhook', label: 'Send Webhook', icon: '🔗', desc: 'POST row data to any URL' },
  { value: 'set_field', label: 'Update Field', icon: '✏️', desc: 'Set a field on the triggering record' },
  { value: 'update_record', label: 'Update Another Record', icon: '🔄', desc: 'Update a record in another table' },
  { value: 'create_record', label: 'Create Record', icon: '➕', desc: 'Insert a row in another table' },
  { value: 'email', label: 'Send Email', icon: '📧', desc: 'Send an email notification (logged)' },
];

export default function WorkflowBuilderPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingWf, setEditingWf] = useState<Workflow | null>(null);
  const [activeTab, setActiveTab] = useState<'workflows'|'logs'>('workflows');

  const load = useCallback(async () => {
    setLoading(true);
    const [wfRes, tableRes] = await Promise.all([
      fetch(`/api/platform/workflows?tenant=${tenantSlug}`).then(r => r.json()),
      fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json()),
    ]);
    setWorkflows(wfRes.workflows ?? []);
    setLogs(wfRes.logs ?? []);
    setTables(tableRes.tables ?? []);
    setLoading(false);
  }, [tenantSlug]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (wf: Workflow) => {
    await fetch(`/api/platform/workflows?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...wf, is_active: !wf.is_active }),
    });
    load();
  };

  const deleteWf = async (id: string) => {
    if (!confirm('Delete this workflow?')) return;
    await fetch(`/api/platform/workflows?tenant=${tenantSlug}&workflowId=${id}`, { method: 'DELETE' });
    load();
  };

  const tabBtn = (tab: typeof activeTab) => ({
    padding: '8px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer' as const,
    backgroundColor: activeTab === tab ? '#6366f1' : 'transparent',
    color: activeTab === tab ? '#fff' : '#64748b', fontSize: '13px', fontWeight: '600' as const,
  });

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Workflow Builder</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Automate actions when your data changes</p>
        </div>
        <button onClick={() => { setEditingWf(null); setShowBuilder(true); }} style={{ padding: '10px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ New Workflow</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '4px', marginBottom: '20px', width: 'fit-content' }}>
        <button style={tabBtn('workflows')} onClick={() => setActiveTab('workflows')}>Workflows ({workflows.length})</button>
        <button style={tabBtn('logs')} onClick={() => setActiveTab('logs')}>Run Logs ({logs.length})</button>
      </div>

      {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: '48px' }}>Loading...</p> : (
        <>
          {activeTab === 'workflows' && (
            workflows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px', border: '2px dashed #e2e8f0', borderRadius: '16px', color: '#94a3b8' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚡</div>
                <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#0f172a' }}>No workflows yet</p>
                <p style={{ fontSize: '13px', marginBottom: '20px' }}>Automate emails, webhooks, and record updates when data changes</p>
                <button onClick={() => setShowBuilder(true)} style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Create your first workflow</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {workflows.map(wf => {
                  const trigger = TRIGGER_TYPES.find(t => t.value === wf.trigger_type);
                  return (
                    <div key={wf.id} style={{ backgroundColor: '#fff', border: `1px solid ${wf.is_active ? '#e2e8f0' : '#f1f5f9'}`, borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', opacity: wf.is_active ? 1 : 0.6 }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: wf.is_active ? '#eff6ff' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>⚡</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ margin: 0, fontWeight: '700', color: '#0f172a', fontSize: '14px' }}>{wf.name}</p>
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', fontWeight: '600', backgroundColor: wf.is_active ? '#d1fae5' : '#f1f5f9', color: wf.is_active ? '#065f46' : '#94a3b8' }}>{wf.is_active ? 'Active' : 'Paused'}</span>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                          {trigger?.icon} {trigger?.label} · {wf.table_label || 'Any table'} · {wf.actions?.length ?? 0} action(s) · ran {wf.run_count} times
                          {wf.last_run_at && ` · last run ${new Date(wf.last_run_at).toLocaleString()}`}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => toggleActive(wf)} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px', fontWeight: '600', color: wf.is_active ? '#f97316' : '#10b981' }}>{wf.is_active ? 'Pause' : 'Resume'}</button>
                        <button onClick={() => { setEditingWf(wf); setShowBuilder(true); }} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px' }}>Edit</button>
                        <button onClick={() => deleteWf(wf.id)} style={{ padding: '6px 12px', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px', color: '#ef4444' }}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 'logs' && (
            logs.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: '48px', fontSize: '13px' }}>No workflow runs yet</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {logs.map(log => {
                  const wf = workflows.find(w => w.id === log.workflow_id);
                  return (
                    <div key={log.id} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '16px' }}>{log.status === 'success' ? '✅' : '❌'}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>{wf?.name ?? log.workflow_id}</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>{new Date(log.ran_at).toLocaleString()} {log.trigger_row_id ? `· row ${log.trigger_row_id.slice(0,8)}...` : ''}</p>
                        {log.error && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#ef4444' }}>{log.error}</p>}
                      </div>
                      <span style={{ fontSize: '11px', color: log.status === 'success' ? '#10b981' : '#ef4444', fontWeight: '600', textTransform: 'uppercase' }}>{log.status}</span>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}

      {showBuilder && (
        <WorkflowFormModal tenantSlug={tenantSlug} workflow={editingWf} tables={tables}
          onClose={() => { setShowBuilder(false); setEditingWf(null); }}
          onSaved={() => { setShowBuilder(false); setEditingWf(null); load(); }} />
      )}
    </div>
  );
}

function WorkflowFormModal({ tenantSlug, workflow, tables, onClose, onSaved }: { tenantSlug: string; workflow: Workflow | null; tables: TableMeta[]; onClose: () => void; onSaved: () => void; }) {
  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [tableId, setTableId] = useState(workflow?.table_id as string ?? '');
  const [triggerType, setTriggerType] = useState(workflow?.trigger_type ?? 'on_create');
  const [triggerConfig, setTriggerConfig] = useState<Record<string,unknown>>(workflow?.trigger_config ?? {});
  const [actions, setActions] = useState<Action[]>(workflow?.actions ?? []);
  const [tableFields, setTableFields] = useState<FieldMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tableId) { setTableFields([]); return; }
    fetch(`/api/platform/fields?tenant=${tenantSlug}&tableId=${tableId}`).then(r => r.json()).then(d => setTableFields((d.fields ?? []).filter((f: FieldMeta & {is_system: boolean}) => !f.is_system)));
  }, [tableId, tenantSlug]);

  const addAction = (type: string) => setActions(prev => [...prev, { type, config: {} }]);
  const removeAction = (idx: number) => setActions(prev => prev.filter((_, i) => i !== idx));
  const updateAction = (idx: number, config: Record<string,unknown>) => setActions(prev => prev.map((a, i) => i === idx ? { ...a, config } : a));

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!triggerType) { setError('Select a trigger'); return; }
    setSaving(true); setError('');
    const tableObj = tables.find(t => t.id === tableId);
    const r = await fetch(`/api/platform/workflows?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: workflow?.id, name, description, table_id: tableId || null, trigger_type: triggerType, trigger_config: triggerConfig, actions }),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { setError(d.error ?? 'Failed'); return; }
    onSaved();
  };

  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box', outline: 'none' };
  const hint = (text: string) => <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>{text}</p>;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '680px', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{workflow ? 'Edit Workflow' : 'New Workflow'}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}>×</button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '10px', borderRadius: '8px', fontSize: '13px' }}>{error}</div>}

          {/* Basic info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Workflow Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="e.g. Notify on new customer, Auto-tag leads" autoFocus />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} style={inp} placeholder="What does this workflow do?" />
            </div>
          </div>

          {/* Trigger */}
          <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px', padding: '16px' }}>
            <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚡ Trigger — When should this run?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
              {TRIGGER_TYPES.map(t => (
                <button key={t.value} onClick={() => setTriggerType(t.value)} style={{ padding: '10px', border: `2px solid ${triggerType === t.value ? '#0369a1' : '#e2e8f0'}`, borderRadius: '8px', cursor: 'pointer', backgroundColor: triggerType === t.value ? '#e0f2fe' : '#fff', textAlign: 'left' as const, fontSize: '12px', fontWeight: triggerType === t.value ? '600' : '400', color: triggerType === t.value ? '#0369a1' : '#374151' }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>On which table?</label>
              <select value={tableId} onChange={e => setTableId(e.target.value)} style={inp}>
                <option value="">— Any table (not recommended) —</option>
                {tables.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            {triggerType === 'on_field_change' && tableFields.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Watch field</label>
                  <select value={String(triggerConfig.field_slug ?? '')} onChange={e => setTriggerConfig(c => ({ ...c, field_slug: e.target.value }))} style={inp}>
                    <option value="">— Any field —</option>
                    {tableFields.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>Only when new value equals (optional)</label>
                  <input value={String(triggerConfig.to_value ?? '')} onChange={e => setTriggerConfig(c => ({ ...c, to_value: e.target.value }))} style={inp} placeholder="Leave blank to trigger on any change" />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px' }}>
            <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎯 Actions — What should happen?</p>

            {actions.length === 0 && <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px' }}>Add at least one action below</p>}

            {actions.map((action, idx) => (
              <div key={idx} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <p style={{ margin: 0, fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>
                    {ACTION_TYPES.find(a => a.value === action.type)?.icon} {ACTION_TYPES.find(a => a.value === action.type)?.label}
                  </p>
                  <button onClick={() => removeAction(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '16px' }}>×</button>
                </div>
                <ActionConfigForm action={action} tables={tables} tableFields={tableFields} tenantSlug={tenantSlug} onChange={config => updateAction(idx, config)} inp={inp} hint={hint} />
              </div>
            ))}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {ACTION_TYPES.map(at => (
                <button key={at.value} onClick={() => addAction(at.value)} style={{ padding: '7px 12px', border: '1px dashed #10b981', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', color: '#065f46', fontSize: '12px', fontWeight: '500' }}>
                  + {at.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template hint */}
          <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#92400e' }}>
            💡 Use <code style={{ backgroundColor: '#fef9c3', padding: '1px 4px', borderRadius: '3px' }}>{'{{field_slug}}'}</code> in any text field to insert the row's value. e.g. <code style={{ backgroundColor: '#fef9c3', padding: '1px 4px', borderRadius: '3px' }}>{'Hello {{name}}'}</code>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
            <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '13px', fontWeight: '600' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: '600' }}>{saving ? 'Saving...' : workflow ? 'Update Workflow' : 'Create Workflow'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionConfigForm({ action, tables, tableFields, tenantSlug, onChange, inp, hint }: {
  action: Action; tables: TableMeta[]; tableFields: FieldMeta[]; tenantSlug: string;
  onChange: (config: Record<string,unknown>) => void; inp: React.CSSProperties; hint: (t: string) => React.ReactElement;
}) {
  const c = action.config;
  const set = (key: string, val: unknown) => onChange({ ...c, [key]: val });

  if (action.type === 'webhook') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>URL *</label><input value={String(c.url??'')} onChange={e => set('url', e.target.value)} style={inp} placeholder="https://hooks.zapier.com/..." />{hint('Supports {{field}} interpolation')}</div>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Method</label>
        <select value={String(c.method??'POST')} onChange={e => set('method', e.target.value)} style={inp}><option>POST</option><option>PUT</option><option>PATCH</option><option>GET</option></select></div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}><input type="checkbox" checked={!!c.include_row} onChange={e => set('include_row', e.target.checked)} /> Include full row data in body</label>
    </div>
  );

  if (action.type === 'set_field') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Field to update *</label>
        <select value={String(c.field_slug??'')} onChange={e => set('field_slug', e.target.value)} style={inp}>
          <option value="">— Select field —</option>
          {tableFields.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
        </select></div>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>New value *</label><input value={String(c.value??'')} onChange={e => set('value', e.target.value)} style={inp} placeholder="Value or {{field}}" />{hint('Supports {{field}} interpolation')}</div>
    </div>
  );

  if (action.type === 'update_record') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Target table *</label>
        <select value={String(c.target_table_slug??'')} onChange={e => set('target_table_slug', e.target.value)} style={inp}>
          <option value="">— Select table —</option>
          {tables.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
        </select></div>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Match where column</label><input value={String(c.match_field??'')} onChange={e => set('match_field', e.target.value)} style={inp} placeholder="e.g. customer_id" /></div>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Equals field from this row</label><input value={String(c.match_value_field??'')} onChange={e => set('match_value_field', e.target.value)} style={inp} placeholder="e.g. id or {{id}}" /></div>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Set field</label><input value={String(c.set_field??'')} onChange={e => set('set_field', e.target.value)} style={inp} placeholder="e.g. status" /></div>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>To value</label><input value={String(c.set_value??'')} onChange={e => set('set_value', e.target.value)} style={inp} placeholder="e.g. active or {{status}}" /></div>
    </div>
  );

  if (action.type === 'create_record') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Create in table *</label>
        <select value={String(c.target_table_slug??'')} onChange={e => set('target_table_slug', e.target.value)} style={inp}>
          <option value="">— Select table —</option>
          {tables.map(t => <option key={t.slug} value={t.slug}>{t.label}</option>)}
        </select></div>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Field mapping (JSON)</label>
        <textarea value={String(c.field_map ? JSON.stringify(c.field_map, null, 2) : '{}')} onChange={e => { try { set('field_map', JSON.parse(e.target.value)); } catch {} }} style={{ ...inp, fontFamily: 'monospace', fontSize: '11px', resize: 'vertical' }} rows={4} />
        {hint('e.g. {"status": "new", "source_id": "{{id}}", "name": "{{name}}"}')}
      </div>
    </div>
  );

  if (action.type === 'email') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>To *</label><input value={String(c.to??'')} onChange={e => set('to', e.target.value)} style={inp} placeholder="admin@company.com or {{email}}" /></div>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Subject *</label><input value={String(c.subject??'')} onChange={e => set('subject', e.target.value)} style={inp} placeholder="New record: {{name}}" /></div>
      <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Body</label><textarea value={String(c.body??'')} onChange={e => set('body', e.target.value)} style={{ ...inp, resize: 'vertical' }} rows={3} placeholder="A new record was created: {{name}}" /></div>
      <div style={{ backgroundColor: '#fef3c7', padding: '8px 10px', borderRadius: '6px', fontSize: '11px', color: '#92400e' }}>⚠ Email is logged only. Configure SMTP in Settings to actually send.</div>
    </div>
  );

  return null;
}
