import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getStockBalance } from '@/platform/stock/engine';
import { requireTenantSession } from '@/lib/auth/tenant-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const itemId = url.searchParams.get('itemId');
  const locationId = url.searchParams.get('locationId');
  const batchNo = url.searchParams.get('batchNo') ?? undefined;
  if (!itemId || !locationId) return NextResponse.json({ error: 'itemId and locationId are required' }, { status: 400 });
  const balance = await getStockBalance(pgPool, ctx.tenant.slug, itemId, locationId, batchNo);
  return NextResponse.json(balance);
}
