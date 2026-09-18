'use client';

/**
 * Same lucide-react/createContext issue as PlatformAdminSidebar - see
 * that file's comment for the full explanation. This page otherwise
 * needs to stay a Server Component (it queries Prisma directly), so
 * only the icon-using presentation piece gets pulled out here.
 */

import { Card } from '@/components/ui';
import { Building2, Users, AlertCircle, CheckCircle } from 'lucide-react';

export function PlatformStatsCards({ total, active, trial, suspended }: { total: number; active: number; trial: number; suspended: number }) {
  const stats = [
    { label: 'Total clients', value: total, icon: <Building2 className="w-5 h-5 text-indigo-600" />, bg: 'bg-indigo-50' },
    { label: 'Active', value: active, icon: <CheckCircle className="w-5 h-5 text-green-600" />, bg: 'bg-green-50' },
    { label: 'Trial', value: trial, icon: <Users className="w-5 h-5 text-amber-600" />, bg: 'bg-amber-50' },
    { label: 'Suspended', value: suspended, icon: <AlertCircle className="w-5 h-5 text-red-600" />, bg: 'bg-red-50' },
  ];

  return (
    <div className="grid grid-cols-4 gap-5">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-sm text-slate-500">{stat.label}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
