import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getStockReport } from '@/platform/stock/engine';
import { requireTenantSession } from '@/lib/auth/tenant-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const filters = { locationId: url.searchParams.get('locationId') ?? undefined, itemId: url.searchParams.get('itemId') ?? undefined, belowReorderLevel: url.searchParams.get('belowReorderLevel') === 'true' };
  const report = await getStockReport(pgPool, ctx.tenant.slug, filters);
  return NextResponse.json(report);
}
