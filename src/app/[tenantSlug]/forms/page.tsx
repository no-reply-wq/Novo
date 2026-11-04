'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Form { id: string; slug: string; title: string; description: string; table_label: string; is_public: boolean; created_at: string; }

export default function FormsPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const router = useRouter();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); const r = await fetch(`/api/platform/forms?tenant=${tenantSlug}`).then(r => r.json()); setForms(r.forms ?? []); setLoading(false); };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [tenantSlug]);

  const del = async (id: string) => {
    if (!confirm('Delete this form?')) return;
    await fetch(`/api/platform/forms?tenant=${tenantSlug}&formId=${id}`, { method: 'DELETE' });
    load();
  };

  const publicUrl = (slug: string) => `${window.location.origin}/f/${slug}?tenant=${tenantSlug}`;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>Forms</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Create public forms that save directly into your tables</p>
        </div>
        <button onClick={() => router.push(`/${tenantSlug}/forms/builder/new`)} style={{ padding: '10px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ New Form</button>
      </div>

      {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: '48px' }}>Loading...</p>
      : forms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', border: '2px dashed #e2e8f0', borderRadius: '16px', color: '#94a3b8' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
          <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', color: '#0f172a' }}>No forms yet</p>
          <p style={{ fontSize: '13px', marginBottom: '20px' }}>Create a form and share it — submissions save directly into your table</p>
          <button onClick={() => router.push(`/${tenantSlug}/forms/builder/new`)} style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Create your first form</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {forms.map(f => (
            <div key={f.id} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#6366f1'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>📋</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <p style={{ margin: 0, fontWeight: '700', color: '#0f172a', fontSize: '14px' }}>{f.title}</p>
                  {f.is_public && <span style={{ fontSize: '10px', backgroundColor: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>Public</span>}
                </div>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                  {f.table_label ? `→ ${f.table_label}` : 'No table linked'} · {new Date(f.created_at).toLocaleDateString()}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => { navigator.clipboard.writeText(publicUrl(f.slug)); alert('Link copied!'); }}
                  style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px' }}>🔗 Copy Link</button>
                <a href={publicUrl(f.slug)} target="_blank" rel="noopener" style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px', textDecoration: 'none', color: '#374151' }}>Preview</a>
                <button onClick={() => router.push(`/${tenantSlug}/forms/builder/${f.id}`)}
                  style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px' }}>Edit</button>
                <button onClick={() => del(f.id)} style={{ padding: '6px 12px', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#fff', fontSize: '12px', color: '#ef4444' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
