'use client';

/**
 * Same lucide-react/createContext issue as the platform admin sidebar
 * - extracted so the page itself can stay a Server Component doing its
 * direct tenantQuery calls.
 */

import Link from 'next/link';
import { Card } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, FileText, ShoppingCart, Package } from 'lucide-react';

export function DashboardKpiCards({ tenantSlug, leadsCount, leadsWon, quotationsCount, quotationsTotal, poCount, poPending, productsCount }: { tenantSlug: string; leadsCount: string | number; leadsWon: string | number; quotationsCount: string | number; quotationsTotal: number; poCount: string | number; poPending: string | number; productsCount: string | number }) {
  const kpis = [
    { label: 'Active leads', value: leadsCount, sub: `${leadsWon} won`, icon: <TrendingUp className="w-5 h-5 text-indigo-600" />, bg: 'bg-indigo-50', href: 'leads' },
    { label: 'Quotations', value: quotationsCount, sub: formatCurrency(quotationsTotal), icon: <FileText className="w-5 h-5 text-blue-600" />, bg: 'bg-blue-50', href: 'quotations' },
    { label: 'Purchase orders', value: poCount, sub: `${poPending} pending`, icon: <ShoppingCart className="w-5 h-5 text-green-600" />, bg: 'bg-green-50', href: 'purchase-orders' },
    { label: 'Products', value: productsCount, sub: 'in catalog', icon: <Package className="w-5 h-5 text-amber-600" />, bg: 'bg-amber-50', href: 'inventory' },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Link key={kpi.label} href={`/${tenantSlug}/${kpi.href}`}>
          <Card className="hover:border-slate-300 transition-colors cursor-pointer">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 ${kpi.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                {kpi.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{kpi.label}</p>
                <p className="text-xs text-indigo-600 font-medium mt-1">{kpi.sub}</p>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
