'use client';

import { useEffect, useState } from 'react';

interface Stats {
  totalForms: number;
  totalSubmissions: number;
  activeUsers: number;
  pendingApprovals: number;
}

interface KpiTile {
  label: string;
  icon: string;
  key: keyof Stats;
}

const tiles: KpiTile[] = [
  { label: 'Total Forms', icon: '📋', key: 'totalForms' },
  { label: 'Total Submissions', icon: '📝', key: 'totalSubmissions' },
  { label: 'Active Users', icon: '👥', key: 'activeUsers' },
  { label: 'Pending Approvals', icon: '⏳', key: 'pendingApprovals' },
];

export function FormBuilderKpiRow({ tenantSlug }: { tenantSlug: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`/api/tenant/dashboard/stats?tenant=${tenantSlug}`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, [tenantSlug]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {tiles.map(({ label, icon, key }) => (
        <div key={key} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
          <span className="text-2xl" aria-hidden="true">{icon}</span>
          <div>
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className="text-xl font-bold text-slate-800">
              {stats == null ? '—' : stats[key].toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
