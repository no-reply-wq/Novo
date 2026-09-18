'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Widget { id: string; widget_type: string; title: string; config: Record<string, unknown>; grid_w: number; }

export default function DashboardClient({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [widgetData, setWidgetData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/platform/dashboard?tenant=${tenantSlug}`);
      const d = await r.json();
      const ws: Widget[] = d.widgets ?? [];
      setWidgets(ws);
      const dataResults = await Promise.all(ws.map(async w => {
        try {
          const dr = await fetch(`/api/platform/dashboard/data?tenant=${tenantSlug}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ widget_type: w.widget_type, config: w.config }),
          });
          return [w.id, await dr.json()];
        } catch { return [w.id, null]; }
      }));
      setWidgetData(Object.fromEntries(dataResults));
    } finally { setLoading(false); }
  }, [tenantSlug]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8', fontFamily: 'system-ui,sans-serif' }}>Loading dashboard...</div>;

  if (widgets.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px', fontFamily: 'system-ui,sans-serif', color: '#94a3b8' }}>
      <div style={{ fontSize: '56px' }}>📊</div>
      <p style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a' }}>Your dashboard is empty</p>
      <p style={{ fontSize: '14px' }}>Add widgets to track your data</p>
      <button onClick={() => router.push(`/${tenantSlug}/dashboard-builder`)} style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Open Dashboard Builder</button>
    </div>
  );

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui,sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>Dashboard</h1>
        <button onClick={() => router.push(`/${tenantSlug}/dashboard-builder`)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#374151' }}>⚙ Edit Dashboard</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {widgets.map(w => (
          <div key={w.id} style={{ gridColumn: `span ${w.grid_w}` }}>
            <WidgetCard widget={w} data={widgetData[w.id]} tenantSlug={tenantSlug} router={router} />
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetCard({ widget, data, tenantSlug, router }: { widget: Widget; data: unknown; tenantSlug: string; router: ReturnType<typeof useRouter> }) {
  const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };

  if (widget.widget_type === 'kpi') {
    const val = (data as {value?: number})?.value ?? 0;
    const config = widget.config as { aggregate?: string; table_slug?: string };
    const prefix = ['sum','avg'].includes(config.aggregate ?? '') ? '₹' : '';
    return (
      <div style={card}>
        <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{widget.title}</p>
        <p style={{ margin: '0 0 4px', fontSize: '32px', fontWeight: '800', color: '#0f172a' }}>{prefix}{typeof val === 'number' ? val.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : val}</p>
        {config.table_slug && <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', cursor: 'pointer' }} onClick={() => router.push(`/${tenantSlug}/data/${config.table_slug}`)}>→ View all records</p>}
      </div>
    );
  }

  if (widget.widget_type === 'chart') {
    const labels = (data as {labels?: string[]})?.labels ?? [];
    const values = (data as {values?: number[]})?.values ?? [];
    const max = Math.max(...values, 1);
    return (
      <div style={card}>
        <p style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{widget.title}</p>
        {labels.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '12px' }}>No data yet</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {labels.map((label, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#374151', marginBottom: '3px' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{label}</span>
                  <span style={{ fontWeight: '600' }}>{values[i]?.toLocaleString('en-IN')}</span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '3px' }}>
                  <div style={{ height: '100%', width: `${(values[i] / max) * 100}%`, backgroundColor: '#6366f1', borderRadius: '3px', transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (widget.widget_type === 'table') {
    const rows = (data as {rows?: Record<string,unknown>[]})?.rows ?? [];
    const config = widget.config as { table_slug?: string };
    const cols = rows.length > 0 ? Object.keys(rows[0]).filter(k => !['id','updated_at'].includes(k)).slice(0,4) : [];
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{widget.title}</p>
          {config.table_slug && <span style={{ fontSize: '11px', color: '#6366f1', cursor: 'pointer', fontWeight: '600' }} onClick={() => router.push(`/${tenantSlug}/data/${config.table_slug}`)}>View all →</span>}
        </div>
        {rows.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '12px' }}>No records yet</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><tr style={{ borderBottom: '1px solid #f1f5f9' }}>{cols.map(c => <th key={c} style={{ padding: '4px 8px', textAlign: 'left', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', fontSize: '10px' }}>{c}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>{cols.map(c => <td key={c} style={{ padding: '6px 8px', color: '#374151', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[c] == null ? '—' : String(row[c])}</td>)}</tr>)}</tbody>
          </table>
        )}
      </div>
    );
  }
  return null;
}
