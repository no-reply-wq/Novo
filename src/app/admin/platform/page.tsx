import { prisma } from '@/lib/db/client';
import { Card } from '@/components/ui';
import { PlatformStatsCards } from '@/components/admin/PlatformStatsCards';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PlatformOverviewPage() {
  const [tenants, recentLogs] = await Promise.all([
    prisma.tenant.findMany({ select: { id: true, name: true, slug: true, status: true, plan: true, seatLimit: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.platformAuditLog.findMany({ take: 20, orderBy: { createdAt: 'desc' }, include: { admin: { select: { name: true, email: true } } } }),
  ]);

  type TenantRow = typeof tenants[number];
  const active = tenants.filter((t: TenantRow) => t.status === 'ACTIVE').length;
  const suspended = tenants.filter((t: TenantRow) => t.status === 'SUSPENDED').length;
  const trial = tenants.filter((t: TenantRow) => t.status === 'TRIAL').length;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Platform Overview</h1>
        <p className="text-sm text-slate-500 mt-1">LRBC ERP — Super Admin Dashboard</p>
      </div>

      <PlatformStatsCards total={tenants.length} active={active} trial={trial} suspended={suspended} />

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Recent clients</h2>
            <Link href="/admin/platform/tenants" className="text-sm text-indigo-600 hover:text-indigo-700">View all →</Link>
          </div>
          <div className="space-y-2">
            {tenants.slice(0, 8).map((t: TenantRow) => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-slate-50">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-600">{t.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.slug}.lrbc-erp.com</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : t.status === 'SUSPENDED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{t.status}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-900 mb-4">Recent activity</h2>
          <div className="space-y-3">
            {recentLogs.map((log: typeof recentLogs[number]) => (
              <div key={log.id} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5"><span className="text-xs font-bold text-slate-600">{log.admin.name.charAt(0)}</span></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700"><span className="font-medium">{log.admin.name}</span>{' '}{log.action.replace(/_/g, ' ').toLowerCase()}</p>
                  <p className="text-xs text-slate-400">{formatDate(log.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
