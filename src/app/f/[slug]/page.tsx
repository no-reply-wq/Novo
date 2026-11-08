'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface FileConfig { accept: string[]; max_size_mb: number; max_files: number; }
interface FormField { field_slug: string; label: string; type: string; required: boolean; placeholder: string; options: string[]; width: 'full' | 'half'; file_config?: FileConfig; }
interface FormConfig { id: string; slug: string; title: string; description: string; fields: FormField[]; settings: { success_message?: string; redirect_url?: string }; }
interface UploadedFile { url: string; name: string; size: number; type: string; }

const MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/svg+xml': 'SVG',
  'video/mp4': 'MP4', 'video/webm': 'WebM', 'video/quicktime': 'MOV',
  'application/pdf': 'PDF', 'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/plain': 'TXT', 'text/csv': 'CSV', 'application/zip': 'ZIP',
};

export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const tenant = searchParams.get('tenant') ?? '';
  const [form, setForm] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [fileUploads, setFileUploads] = useState<Record<string, UploadedFile[]>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetch(`/api/public/forms/${slug}?tenant=${tenant}`)
      .then(r => r.json()).then(d => {
        if (d.error) setError(d.error);
        else setForm(d.form);
        setLoading(false);
      }).catch(() => { setError('Failed to load form'); setLoading(false); });
  }, [slug, tenant]);

  const set = (slug: string, value: unknown) => setData(d => ({ ...d, [slug]: value }));

  const handleFileUpload = useCallback(async (fieldSlug: string, files: FileList, config?: FileConfig) => {
    if (!files.length) return;
    setUploading(u => ({ ...u, [fieldSlug]: true }));
    setUploadErrors(e => ({ ...e, [fieldSlug]: '' }));

    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));

    const params = new URLSearchParams({ tenant });
    if (config?.max_size_mb) params.set('max_size_mb', String(config.max_size_mb));
    if (config?.max_files) params.set('max_files', String(config.max_files));
    if (config?.accept?.length) params.set('accept', config.accept.join(','));

    try {
      const r = await fetch(`/api/platform/upload?${params}`, { method: 'POST', body: formData });
      const d = await r.json();
      if (!r.ok) { setUploadErrors(e => ({ ...e, [fieldSlug]: d.error ?? 'Upload failed' })); return; }
      const uploaded: UploadedFile[] = d.files ?? [];
      setFileUploads(prev => ({ ...prev, [fieldSlug]: [...(prev[fieldSlug] ?? []), ...uploaded] }));
      // Store URLs as comma-separated string in data
      const allFiles = [...(fileUploads[fieldSlug] ?? []), ...uploaded];
      set(fieldSlug, allFiles.map(f => f.url).join(','));
      if (d.errors?.length) setUploadErrors(e => ({ ...e, [fieldSlug]: d.errors.join('; ') }));
    } catch { setUploadErrors(e => ({ ...e, [fieldSlug]: 'Upload failed — please try again' })); }
    finally { setUploading(u => ({ ...u, [fieldSlug]: false })); }
  }, [tenant, fileUploads]);

  const removeFile = (fieldSlug: string, idx: number) => {
    const updated = (fileUploads[fieldSlug] ?? []).filter((_, i) => i !== idx);
    setFileUploads(prev => ({ ...prev, [fieldSlug]: updated }));
    set(fieldSlug, updated.map(f => f.url).join(','));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Check file uploads still in progress
    if (Object.values(uploading).some(Boolean)) { setSubmitError('Please wait for uploads to complete'); return; }
    setSubmitting(true); setSubmitError('');
    try {
      const r = await fetch(`/api/public/forms/${slug}?tenant=${tenant}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const d = await r.json();
      if (!r.ok) { setSubmitError(d.error ?? 'Submission failed'); setSubmitting(false); return; }
      if (d.redirect_url) { window.location.href = d.redirect_url; return; }
      setSubmitted(true);
    } catch { setSubmitError('Network error — please try again'); }
    setSubmitting(false);
  };

  const inp: React.CSSProperties = { width: '100%', border: '1.5px solid #e2e8f0', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', backgroundColor: '#fff', fontFamily: 'system-ui,sans-serif', transition: 'border-color 0.15s' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' };

  const renderInput = (f: FormField) => {
    const val = data[f.field_slug] ?? '';
    switch (f.type) {
      case 'long_text': return <textarea value={String(val)} onChange={e => set(f.field_slug, e.target.value)} style={{ ...inp, resize: 'vertical' }} rows={4} placeholder={f.placeholder} required={f.required} />;
      case 'boolean': return <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}><input type="checkbox" checked={!!val} onChange={e => set(f.field_slug, e.target.checked)} style={{ width: '18px', height: '18px' }} /> Yes</label>;
      case 'select': return <select value={String(val)} onChange={e => set(f.field_slug, e.target.value)} style={inp} required={f.required}><option value="">— Select —</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
      case 'number': case 'decimal': case 'currency': case 'percent': return <input type="number" value={String(val)} onChange={e => set(f.field_slug, e.target.value)} style={inp} placeholder={f.placeholder} required={f.required} step={['decimal','currency'].includes(f.type) ? '0.01' : '1'} />;
      case 'date': return <input type="date" value={String(val)} onChange={e => set(f.field_slug, e.target.value)} style={inp} required={f.required} />;
      case 'datetime': return <input type="datetime-local" value={String(val)} onChange={e => set(f.field_slug, e.target.value)} style={inp} required={f.required} />;
      case 'email': return <input type="email" value={String(val)} onChange={e => set(f.field_slug, e.target.value)} style={inp} placeholder={f.placeholder || 'you@example.com'} required={f.required} />;
      case 'phone': return <input type="tel" value={String(val)} onChange={e => set(f.field_slug, e.target.value)} style={inp} placeholder={f.placeholder || '+91 98765 43210'} required={f.required} />;
      case 'url': return <input type="url" value={String(val)} onChange={e => set(f.field_slug, e.target.value)} style={inp} placeholder={f.placeholder || 'https://'} required={f.required} />;
      case 'file': case 'image': return <FileUploadField field={f} uploadedFiles={fileUploads[f.field_slug] ?? []} uploading={!!uploading[f.field_slug]} uploadError={uploadErrors[f.field_slug] ?? ''} onUpload={(files) => handleFileUpload(f.field_slug, files, f.file_config)} onRemove={(idx) => removeFile(f.field_slug, idx)} />;
      default: return <input type="text" value={String(val)} onChange={e => set(f.field_slug, e.target.value)} style={inp} placeholder={f.placeholder} required={f.required} />;
    }
  };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', fontFamily: 'system-ui,sans-serif' }}><div style={{ color: '#94a3b8' }}>Loading form...</div></div>;

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>
        <div style={{ width: 48, height: 48, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1" ry="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
        </div>
        <p style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a' }}>Form not found</p>
        <p style={{ fontSize: '14px' }}>This form may have been removed or the link is incorrect.</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', fontFamily: 'system-ui,sans-serif', padding: '24px' }}>
      <div style={{ maxWidth: '480px', width: '100%', backgroundColor: '#fff', borderRadius: '20px', padding: '48px 32px', boxShadow: '0 8px 40px rgba(0,0,0,0.08)', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 20px' }}>✓</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>{form?.settings?.success_message ?? 'Thank you!'}</h2>
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Your response has been recorded.</p>
        <button onClick={() => { setSubmitted(false); setData({}); setFileUploads({}); }} style={{ marginTop: '24px', padding: '10px 24px', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151' }}>Submit another response</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: 'system-ui,sans-serif', padding: '40px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ backgroundColor: '#6366f1', borderRadius: '16px 16px 0 0', padding: '32px 32px 24px' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: '800', color: '#fff' }}>{form?.title}</h1>
          {form?.description && <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{form.description}</p>}
        </div>
        <form onSubmit={handleSubmit} style={{ backgroundColor: '#fff', borderRadius: '0 0 16px 16px', padding: '32px', boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
          {submitError && <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px' }}>{submitError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {(form?.fields ?? []).map((f, i) => (
              <div key={i} style={{ gridColumn: f.width === 'half' ? 'span 1' : 'span 2' }}>
                <label style={lbl}>{f.label}{f.required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}</label>
                {renderInput(f)}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '28px' }}>
            <button type="submit" disabled={submitting || Object.values(uploading).some(Boolean)} style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '12px', backgroundColor: '#6366f1', color: '#fff', cursor: (submitting || Object.values(uploading).some(Boolean)) ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700', opacity: (submitting || Object.values(uploading).some(Boolean)) ? 0.7 : 1 }}>
              {submitting ? 'Submitting...' : Object.values(uploading).some(Boolean) ? 'Uploading files...' : 'Submit'}
            </button>
          </div>
        </form>
        <p style={{ textAlign: 'center', fontSize: '11px', color: '#94a3b8', marginTop: '16px' }}>Powered by LRBC ERP</p>
      </div>
    </div>
  );
}

// ── File Upload Field Component ───────────────────────────────────────────
function FileUploadField({ field, uploadedFiles, uploading, uploadError, onUpload, onRemove }: {
  field: FormField; uploadedFiles: UploadedFile[]; uploading: boolean; uploadError: string;
  onUpload: (files: FileList) => void; onRemove: (idx: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const config = field.file_config ?? { accept: [], max_size_mb: 10, max_files: 10 };
  const isImage = field.type === 'image';
  const acceptStr = config.accept.length ? config.accept.join(',') : undefined;
  const canAddMore = uploadedFiles.length < config.max_files;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files);
  };

  const friendly = config.accept.length
    ? config.accept.map(a => MIME_LABELS[a] ?? a).join(', ')
    : isImage ? 'Any image' : 'Any file';
  const sizeLabel = config.max_size_mb < 1 ? `${config.max_size_mb * 1000}KB` : `${config.max_size_mb}MB`;

  return (
    <div>
      {/* Drop zone */}
      {canAddMore && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? '#6366f1' : '#e2e8f0'}`, borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer', backgroundColor: dragging ? '#eff6ff' : '#f8fafc', transition: 'all 0.15s' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>{isImage ? '🖼' : '📎'}</div>
          <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
            {uploading ? 'Uploading...' : 'Click or drag & drop'}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
            {friendly} · Max {sizeLabel} · Up to {config.max_files} file{config.max_files > 1 ? 's' : ''}
          </p>
          <input ref={fileRef} type="file" accept={acceptStr} multiple={config.max_files > 1} onChange={e => { if (e.target.files) onUpload(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
        </div>
      )}

      {/* Upload error */}
      {uploadError && <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#ef4444' }}>{uploadError}</p>}

      {/* Uploaded files preview */}
      {uploadedFiles.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {uploadedFiles.map((file, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              {file.type.startsWith('image/') ? (
                <img src={file.url} alt={file.name} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                  {file.type.includes('pdf') ? '📄' : file.type.includes('video') ? '🎬' : '📎'}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: '600', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{(file.size / 1024).toFixed(0)} KB · <a href={file.url} target="_blank" rel="noopener" style={{ color: '#6366f1' }}>View</a></p>
              </div>
              <button type="button" onClick={() => onRemove(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '18px', padding: '0 4px', flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Show how many more can be added */}
      {!canAddMore && <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#94a3b8' }}>Maximum {config.max_files} file{config.max_files > 1 ? 's' : ''} uploaded</p>}
    </div>
  );
}
