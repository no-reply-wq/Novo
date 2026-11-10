import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getStockBalanceByBatch } from '@/platform/engines/stock/engine';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export async function GET(req: NextRequest) {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const appId = searchParams.get('appId');
  const itemId = searchParams.get('itemId');
  const locationId = searchParams.get('locationId');
  if (!appId || !itemId || !locationId) {
    return NextResponse.json({ error: 'appId, itemId, locationId required' }, { status: 400 });
  }
  try {
    const batches = await getStockBalanceByBatch(appId, itemId, locationId, pgPool);
    return NextResponse.json({ batches });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
