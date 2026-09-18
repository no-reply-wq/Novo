import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { tenantQuery, pgPool } from '@/lib/db/client';
import { Card } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DashboardKpiCards } from '@/components/admin/DashboardKpiCards';
import Link from 'next/link';
import { DynamicDashboard } from '@/components/page-builder/DynamicDashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const session = await getServerSession(authOptions);

  let schemaName: string | undefined = session?.user.schemaName;
  if (!schemaName) {
    try {
      const r = await pgPool.query(`SELECT schema_name FROM public.tenants WHERE slug = $1`, [tenantSlug]);
      schemaName = r.rows[0]?.schema_name;
    } catch {
      schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
    }
  }
  console.log('[Dashboard] schemaName:', schemaName);
  if (!schemaName) return null;

  let customLayout = null;
  try {
    await tenantQuery(schemaName, `CREATE TABLE IF NOT EXISTS page_layouts (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, page_key TEXT NOT NULL UNIQUE, layout JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const result = await tenantQuery(schemaName, `SELECT layout FROM page_layouts WHERE page_key = $1`, ['dashboard']);
    console.log('[Dashboard] rows:', result.rows.length);
    if (result.rows.length > 0 && result.rows[0].layout?.rootIds?.length > 0) {
      customLayout = result.rows[0].layout;
    }
  } catch(e) {
    console.error('[Dashboard] error:', e);
  }

  if (customLayout) {
    return <DynamicDashboard layout={customLayout} tenantSlug={tenantSlug} />;
  }

  const [leadStats, quotationStats, poStats, inventoryStats, recentLeads, recentQuotations] = await Promise.all([
    tenantQuery<{ count: string; won: string }>(schemaName, `SELECT COUNT(*) as count, COUNT(CASE WHEN ls.is_won THEN 1 END) as won FROM leads l LEFT JOIN lead_stages ls ON ls.id = l.stage_id`),
    tenantQuery<{ count: string; total: string }>(schemaName, `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM quotations WHERE is_latest = true`),
    tenantQuery<{ count: string; pending: string }>(schemaName, `SELECT COUNT(*) as count, COUNT(CASE WHEN status IN ('draft','sent') THEN 1 END) as pending FROM purchase_orders`),
    tenantQuery<{ products: string }>(schemaName, 'SELECT COUNT(*) as products FROM products WHERE active = true'),
    tenantQuery(schemaName, `SELECT l.title, l.expected_value, ls.name as stage_name, ls.color as stage_color, c.company as client_company FROM leads l LEFT JOIN lead_stages ls ON ls.id = l.stage_id LEFT JOIN clients c ON c.id = l.client_id ORDER BY l.created_at DESC LIMIT 5`),
    tenantQuery(schemaName, `SELECT q.number, q.total, q.status, c.company as client_company FROM quotations q LEFT JOIN clients c ON c.id = q.client_id WHERE q.is_latest = true ORDER BY q.created_at DESC LIMIT 5`),
  ]);

  const leads = leadStats.rows[0];
  const quotes = quotationStats.rows[0];
  const pos = poStats.rows[0];
  const inv = inventoryStats.rows[0];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">{formatDate(new Date())}</p>
      </div>
      <DashboardKpiCards tenantSlug={tenantSlug} leadsCount={leads?.count ?? '0'} leadsWon={leads?.won ?? '0'} quotationsCount={quotes?.count ?? '0'} quotationsTotal={parseFloat(quotes?.total ?? '0')} poCount={pos?.count ?? '0'} poPending={pos?.pending ?? '0'} productsCount={inv?.products ?? '0'} />
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Recent leads</h2>
            <Link href={`/${tenantSlug}/leads`} className="text-sm text-indigo-600 hover:text-indigo-700">View all →</Link>
          </div>
          <div className="space-y-3">
            {recentLeads.rows.length === 0 ? (
              <p className="text-sm text-slate-400">No leads yet</p>
            ) : recentLeads.rows.map((lead: Record<string, unknown>, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: (lead.stage_color as string) ?? '#94a3b8' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{lead.title as string}</p>
                  <p className="text-xs text-slate-400">{(lead.client_company as string) ?? 'No client'}</p>
                </div>
                {lead.expected_value && <span className="text-xs font-medium text-slate-600">{formatCurrency(lead.expected_value as number)}</span>}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Recent quotations</h2>
            <Link href={`/${tenantSlug}/quotations`} className="text-sm text-indigo-600 hover:text-indigo-700">View all →</Link>
          </div>
          <div className="space-y-3">
            {recentQuotations.rows.length === 0 ? (
              <p className="text-sm text-slate-400">No quotations yet</p>
            ) : recentQuotations.rows.map((q: Record<string, unknown>, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700">{q.number as string}</p>
                  <p className="text-xs text-slate-400">{q.client_company as string}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${q.status === 'approved' ? 'bg-green-100 text-green-700' : q.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{q.status as string}</span>
                <span className="text-xs font-medium text-slate-600">{formatCurrency(q.total as number)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
