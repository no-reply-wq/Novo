'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ModuleClient({ tenantSlug, appSlug }: { tenantSlug: string; appSlug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'redirect' | 'notfound'>('loading');

  useEffect(() => {
    // Check if this module matches a table slug → redirect to data grid
    fetch(`/api/platform/tables?tenant=${tenantSlug}`)
      .then(r => r.json())
      .then(d => {
        const tables = d.tables ?? [];
        const match = tables.find((t: { slug: string }) => t.slug === module);
        if (match) {
          router.replace(`/${tenantSlug}/data/${module}`);
        } else {
          setStatus('notfound');
        }
      })
      .catch(() => setStatus('notfound'));
  }, [tenantSlug, module, router]);

  if (status === 'loading') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui,sans-serif', color: '#94a3b8' }}>
      Loading...
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui,sans-serif', flexDirection: 'column', gap: '16px', color: '#94a3b8' }}>
      <div style={{ fontSize: '48px' }}>🔍</div>
      <p style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a' }}>Page not found: /{module}</p>
      <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', maxWidth: '400px' }}>
        This URL doesn&apos;t match any table or page. In Nav Builder, make sure the URL path matches an existing table slug (e.g. <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>data/products</code>) or an existing page (e.g. <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>table-builder</code>).
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => router.push(`/${tenantSlug}/nav-builder`)} style={{ padding: '10px 20px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Fix in Nav Builder</button>
        <button onClick={() => router.push(`/${tenantSlug}/dashboard`)} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#374151' }}>Go to Dashboard</button>
      </div>
    </div>
  );
}
