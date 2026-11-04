'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface TableMeta { id: string; slug: string; label: string; }
interface FieldMeta { id: string; slug: string; label: string; type: string; is_required: boolean; is_system?: boolean; options: Record<string, unknown>; }
interface FormField { field_slug: string; label: string; type: string; required: boolean; placeholder: string; options: string[]; width: 'full' | 'half'; file_config?: { accept: string[]; max_size_mb: number; max_files: number; }; }

const FIELD_TYPE_LABELS: Record<string, string> = { text:'Text', long_text:'Long Text', number:'Number', decimal:'Decimal', currency:'Currency', boolean:'Checkbox', date:'Date', datetime:'Date & Time', select:'Dropdown', email:'Email', phone:'Phone', url:'URL', file:'File Upload', image:'Image Upload' };

export default function FormBuilderPage() {
  const { tenantSlug, formId } = useParams<{ tenantSlug: string; formId: string }>();
  const router = useRouter();
  const isNew = formId === 'new';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tableId, setTableId] = useState('');
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [successMsg, setSuccessMsg] = useState('Thank you! Your response has been recorded.');
  const [isPublic, setIsPublic] = useState(true);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [tableFields, setTableFields] = useState<FieldMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [editingField, setEditingField] = useState<number | null>(null);
  const [formSlug, setFormSlug] = useState('');

  const load = useCallback(async () => {
    const tr = await fetch(`/api/platform/tables?tenant=${tenantSlug}`).then(r => r.json());
    setTables(tr.tables ?? []);
    if (!isNew) {
      const fr = await fetch(`/api/platform/forms?tenant=${tenantSlug}&formId=${formId}`).then(r => r.json());
      if (fr.form) {
        const f = fr.form;
        setTitle(f.title); setDescription(f.description || ''); setTableId(f.table_id || '');
        setFormFields(f.fields || []); setIsPublic(f.is_public); setFormSlug(f.slug);
        const settings = f.settings || {};
        setSuccessMsg(settings.success_message || 'Thank you! Your response has been recorded.');
      }
    }
  }, [tenantSlug, formId, isNew]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // Load fields when table changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!tableId) { setTableFields([]); return; }
    void fetch(`/api/platform/fields?tenant=${tenantSlug}&tableId=${tableId}`).then(r => r.json()).then(d => setTableFields((d.fields ?? []).filter((f: FieldMeta) => !f.is_system && f.type !== 'auto_number' && f.type !== 'relation')));
  }, [tableId, tenantSlug]);

  const autoGenerateFields = () => {
    const generated: FormField[] = tableFields.map(f => ({
      field_slug: f.slug, label: f.label, type: f.type,
      required: f.is_required, placeholder: '',
      options: (f.options?.choices as string[]) ?? [],
      width: 'full',
      ...(f.type === 'file' || f.type === 'image' ? { file_config: { accept: f.type === 'image' ? ['image/jpeg','image/png','image/webp'] : [], max_size_mb: 5, max_files: 1 } } : {}),
    }));
    setFormFields(generated);
  };

  const addField = (tf: FieldMeta) => {
    if (formFields.find(f => f.field_slug === tf.slug)) return;
    setFormFields(prev => [...prev, { field_slug: tf.slug, label: tf.label, type: tf.type, required: tf.is_required, placeholder: '', options: (tf.options?.choices as string[]) ?? [], width: 'full', ...(tf.type === 'file' || tf.type === 'image' ? { file_config: { accept: tf.type === 'image' ? ['image/jpeg','image/png','image/webp'] : [], max_size_mb: 5, max_files: 1 } } : {}) }]);
  };

  const removeField = (idx: number) => setFormFields(prev => prev.filter((_, i) => i !== idx));
  const moveField = (idx: number, dir: 'up' | 'down') => {
    const next = [...formFields];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setFormFields(next);
  };
  const updateField = (idx: number, updates: Partial<FormField>) => setFormFields(prev => prev.map((f, i) => i === idx ? { ...f, ...updates } : f));

  const handleSave = async () => {
    if (!title.trim()) { alert('Form title is required'); return; }
    setSaving(true);
    const r = await fetch(`/api/platform/forms?tenant=${tenantSlug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: isNew ? undefined : formId, title, description, table_id: tableId || null, fields: formFields, settings: { success_message: successMsg }, is_public: isPublic }),
    });
    const d = await r.json();
    setSaving(false);
    if (!r.ok) { alert(d.error ?? 'Failed'); return; }
    if (isNew) router.push(`/${tenantSlug}/forms/builder/${d.form.id}`);
    else { setFormSlug(d.form.slug); setSaved('Saved!'); setTimeout(() => setSaved(''), 3000); }
  };

  const publicUrl = formSlug ? `${typeof window !== 'undefined' ? window.location.origin : ''}/f/${formSlug}?tenant=${tenantSlug}` : '';
  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui,sans-serif', fontSize: '13px' }}>

      {/* Left: Builder */}
      <div style={{ width: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => router.push(`/${tenantSlug}/forms`)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: '18px' }}>←</button>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#0f172a', flex: 1 }}>{isNew ? 'New Form' : 'Edit Form'}</h2>
          {saved && <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>✓ {saved}</span>}
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>{saving ? 'Saving...' : 'Save'}</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Form settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Form Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={inp} placeholder="e.g. Contact Us, Product Inquiry" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inp, resize: 'vertical' }} rows={2} placeholder="Optional description shown at the top of the form" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Save responses to table</label>
              <select value={tableId} onChange={e => setTableId(e.target.value)} style={inp}>
                <option value="">— Select a table —</option>
                {tables.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            {tableId && tableFields.length > 0 && formFields.length === 0 && (
              <button onClick={autoGenerateFields} style={{ padding: '8px 16px', border: '1px dashed #6366f1', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#4338ca', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                ✨ Auto-generate fields from table
              </button>
            )}
          </div>

          {/* Table fields to add */}
          {tableFields.length > 0 && (
            <div>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Add fields from table</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tableFields.map(tf => {
                  const added = formFields.some(f => f.field_slug === tf.slug);
                  return (
                    <button key={tf.slug} onClick={() => addField(tf)} disabled={added}
                      style={{ padding: '4px 10px', border: `1px solid ${added ? '#e2e8f0' : '#6366f1'}`, borderRadius: '20px', backgroundColor: added ? '#f1f5f9' : '#eff6ff', color: added ? '#94a3b8' : '#4338ca', cursor: added ? 'default' : 'pointer', fontSize: '11px', fontWeight: '500' }}>
                      {tf.label} {added ? '✓' : '+'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Form fields list */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Form Fields ({formFields.length})</p>
            {formFields.length === 0 ? (
              <div style={{ padding: '24px', border: '2px dashed #e2e8f0', borderRadius: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                {tableId ? 'Click fields above to add them' : 'Select a table first, then add fields'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {formFields.map((f, idx) => (
                  <div key={idx}>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <button onClick={() => moveField(idx, 'up')} disabled={idx === 0} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '10px', color: '#94a3b8', padding: '1px 4px', opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                        <button onClick={() => moveField(idx, 'down')} disabled={idx === formFields.length - 1} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '10px', color: '#94a3b8', padding: '1px 4px', opacity: idx === formFields.length - 1 ? 0.3 : 1 }}>↓</button>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: '600', color: '#0f172a', fontSize: '12px' }}>{f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}</p>
                        <p style={{ margin: 0, fontSize: '10px', color: '#64748b' }}>{FIELD_TYPE_LABELS[f.type] ?? f.type} · {f.field_slug}</p>
                      </div>
                      <button onClick={() => setEditingField(editingField === idx ? null : idx)} style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', backgroundColor: editingField === idx ? '#eff6ff' : '#fff', fontSize: '11px', color: editingField === idx ? '#4338ca' : '#374151' }}>Edit</button>
                      <button onClick={() => removeField(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '16px', padding: '0 4px' }}>×</button>
                    </div>
                    {editingField === idx && (
                      <div style={{ backgroundColor: '#fff', border: '1px solid #6366f1', borderRadius: '8px', padding: '12px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div><label style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Label</label><input value={f.label} onChange={e => updateField(idx, { label: e.target.value })} style={{ ...inp, marginTop: '4px' }} /></div>
                        {!['file','image','boolean'].includes(f.type) && <div><label style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Placeholder</label><input value={f.placeholder} onChange={e => updateField(idx, { placeholder: e.target.value })} style={{ ...inp, marginTop: '4px' }} placeholder="Optional hint text" /></div>}
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}><input type="checkbox" checked={f.required} onChange={e => updateField(idx, { required: e.target.checked })} /> Required</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                            Width: <select value={f.width} onChange={e => updateField(idx, { width: e.target.value as 'full' | 'half' })} style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px 6px', fontSize: '12px' }}><option value="full">Full</option><option value="half">Half</option></select>
                          </label>
                        </div>
                        {(f.type === 'file' || f.type === 'image') && (
                          <FileFieldConfig config={f.file_config ?? { accept: [], max_size_mb: 5, max_files: 1 }} type={f.type} onChange={fc => updateField(idx, { file_config: fc })} />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Form Settings</p>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Success Message</label>
              <input value={successMsg} onChange={e => setSuccessMsg(e.target.value)} style={inp} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
              Public — anyone with the link can submit
            </label>
            {formSlug && (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px' }}>
                <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: '600', color: '#065f46' }}>Public URL</p>
                <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#374151', wordBreak: 'break-all' }}>{publicUrl}</p>
                <button onClick={() => { navigator.clipboard.writeText(publicUrl); }} style={{ border: 'none', borderRadius: '4px', padding: '4px 10px', backgroundColor: '#10b981', color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Copy Link</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Live Preview */}
      <div style={{ flex: 1, backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Live Preview</div>
        <div style={{ flex: 1, overflow: 'auto', padding: '32px', display: 'flex', justifyContent: 'center' }}>
          <FormPreview title={title} description={description} fields={formFields} successMsg={successMsg} />
        </div>
      </div>
    </div>
  );
}

function FormPreview({ title, description, fields, successMsg }: { title: string; description: string; fields: FormField[]; successMsg: string; }) {
  const [submitted, setSubmitted] = useState(false);
  const inp: React.CSSProperties = { width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', backgroundColor: '#fff' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' };

  const renderInput = (f: FormField) => {
    switch (f.type) {
      case 'long_text': return <textarea style={{ ...inp, resize: 'vertical' }} rows={3} placeholder={f.placeholder} />;
      case 'boolean': return <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}><input type="checkbox" /> Yes</label>;
      case 'select': return <select style={inp}><option value="">— Select —</option>{f.options.map(o => <option key={o}>{o}</option>)}</select>;
      case 'number': case 'decimal': case 'currency': case 'percent': return <input type="number" style={inp} placeholder={f.placeholder} />;
      case 'date': return <input type="date" style={inp} />;
      case 'datetime': return <input type="datetime-local" style={inp} />;
      case 'email': return <input type="email" style={inp} placeholder={f.placeholder || 'email@example.com'} />;
      case 'phone': return <input type="tel" style={inp} placeholder={f.placeholder || '+91 98765 43210'} />;
      case 'url': return <input type="url" style={inp} placeholder={f.placeholder || 'https://'} />;
      case 'file': case 'image': {
        const cfg = f.file_config ?? { accept: [], max_size_mb: 5, max_files: 1 };
        const friendly = cfg.accept.length ? cfg.accept.map((a: string) => a.split('/')[1]?.toUpperCase() ?? a).join(', ') : f.type === 'image' ? 'Any image' : 'Any file';
        return <div style={{ border: '2px dashed #e2e8f0', borderRadius: '10px', padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', cursor: 'default' }}>
          <div style={{ fontSize: '28px', marginBottom: '6px' }}>{f.type === 'image' ? '🖼' : '📎'}</div>
          <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>Click or drag & drop</p>
          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{friendly} · Max {cfg.max_size_mb}MB · Up to {cfg.max_files} file{cfg.max_files > 1 ? 's' : ''}</p>
        </div>;
      }
      default: return <input type="text" style={inp} placeholder={f.placeholder} />;
    }
  };

  if (submitted) return (
    <div style={{ maxWidth: '560px', width: '100%', backgroundColor: '#fff', borderRadius: '16px', padding: '48px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
      <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>{successMsg}</p>
      <button onClick={() => setSubmitted(false)} style={{ marginTop: '16px', padding: '8px 20px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '13px' }}>Submit another response</button>
    </div>
  );

  return (
    <div style={{ maxWidth: '560px', width: '100%', backgroundColor: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>{title || 'Untitled Form'}</h1>
      {description && <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>{description}</p>}
      {fields.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '24px' }}>Add fields from the left panel</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {fields.map((f, i) => (
            <div key={i} style={{ gridColumn: f.width === 'half' ? 'span 1' : 'span 2' }}>
              <label style={lbl}>{f.label}{f.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}</label>
              {renderInput(f)}
            </div>
          ))}
          <div style={{ gridColumn: 'span 2', marginTop: '8px' }}>
            <button onClick={() => setSubmitted(true)} style={{ width: '100%', padding: '12px', border: 'none', borderRadius: '10px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>Submit</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── File Field Config Component ───────────────────────────────────────────
const MIME_PRESETS = [
  { label: 'JPEG', value: 'image/jpeg' },
  { label: 'PNG', value: 'image/png' },
  { label: 'WebP', value: 'image/webp' },
  { label: 'GIF', value: 'image/gif' },
  { label: 'SVG', value: 'image/svg+xml' },
  { label: 'PDF', value: 'application/pdf' },
  { label: 'Word', value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { label: 'Excel', value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { label: 'MP4', value: 'video/mp4' },
  { label: 'WebM', value: 'video/webm' },
  { label: 'CSV', value: 'text/csv' },
  { label: 'TXT', value: 'text/plain' },
  { label: 'ZIP', value: 'application/zip' },
];

function FileFieldConfig({ config, type, onChange }: {
  config: { accept: string[]; max_size_mb: number; max_files: number };
  type: string;
  onChange: (config: { accept: string[]; max_size_mb: number; max_files: number }) => void;
}) {
  const toggleType = (mime: string) => {
    const next = config.accept.includes(mime)
      ? config.accept.filter(a => a !== mime)
      : [...config.accept, mime];
    onChange({ ...config, accept: next });
  };

  const presets = type === 'image'
    ? MIME_PRESETS.filter(p => p.value.startsWith('image/'))
    : MIME_PRESETS;

  const inp: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', outline: 'none', width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: '#0369a1' }}>📎 File Upload Settings</p>

      {/* Accepted types */}
      <div>
        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase' }}>
          Accepted File Types {config.accept.length === 0 ? '(all types allowed)' : `(${config.accept.length} selected)`}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {presets.map(p => (
            <button key={p.value} onClick={() => toggleType(p.value)} type="button"
              style={{ padding: '3px 10px', border: `1px solid ${config.accept.includes(p.value) ? '#0369a1' : '#e2e8f0'}`, borderRadius: '16px', cursor: 'pointer', backgroundColor: config.accept.includes(p.value) ? '#e0f2fe' : '#fff', color: config.accept.includes(p.value) ? '#0369a1' : '#374151', fontSize: '11px', fontWeight: config.accept.includes(p.value) ? '600' : '400' }}>
              {p.label} {config.accept.includes(p.value) ? '✓' : '+'}
            </button>
          ))}
        </div>
        {config.accept.length === 0 && <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#94a3b8' }}>No types selected = accept everything</p>}
      </div>

      {/* Max size */}
      <div>
        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Max file size (MB per file)</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[0.5, 1, 2, 5, 10, 25, 50].map(mb => (
            <button key={mb} onClick={() => onChange({ ...config, max_size_mb: mb })} type="button"
              style={{ padding: '4px 10px', border: `1px solid ${config.max_size_mb === mb ? '#0369a1' : '#e2e8f0'}`, borderRadius: '6px', cursor: 'pointer', backgroundColor: config.max_size_mb === mb ? '#e0f2fe' : '#fff', color: config.max_size_mb === mb ? '#0369a1' : '#374151', fontSize: '11px', fontWeight: config.max_size_mb === mb ? '600' : '400' }}>
              {mb < 1 ? `${mb * 1000}KB` : `${mb}MB`}
            </button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Custom:</span>
            <input type="number" value={config.max_size_mb} onChange={e => onChange({ ...config, max_size_mb: parseFloat(e.target.value) || 1 })} style={{ ...inp, width: '60px' }} step="0.5" min="0.1" max="100" />
            <span style={{ fontSize: '11px', color: '#64748b' }}>MB</span>
          </div>
        </div>
      </div>

      {/* Max files */}
      <div>
        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>Max number of files</label>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {[1, 2, 3, 5, 10].map(n => (
            <button key={n} onClick={() => onChange({ ...config, max_files: n })} type="button"
              style={{ padding: '4px 12px', border: `1px solid ${config.max_files === n ? '#0369a1' : '#e2e8f0'}`, borderRadius: '6px', cursor: 'pointer', backgroundColor: config.max_files === n ? '#e0f2fe' : '#fff', color: config.max_files === n ? '#0369a1' : '#374151', fontSize: '11px', fontWeight: config.max_files === n ? '600' : '400' }}>
              {n}
            </button>
          ))}
        </div>
        {config.max_files === 1 ? <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>Single file upload</p> : <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>Up to {config.max_files} files at once</p>}
      </div>

      {/* Summary */}
      <div style={{ backgroundColor: '#fff', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: '#374151', border: '1px solid #e0f2fe' }}>
        <strong>Summary:</strong> {config.accept.length === 0 ? 'Any file type' : config.accept.map(a => MIME_PRESETS.find(p => p.value === a)?.label ?? a).join(', ')} · Max {config.max_size_mb < 1 ? `${config.max_size_mb * 1000}KB` : `${config.max_size_mb}MB`} per file · Up to {config.max_files} file(s)
      </div>
    </div>
  );
}
