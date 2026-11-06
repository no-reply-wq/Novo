import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getStockReport } from '@/platform/stock/engine';

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const url = new URL(req.url);
  const filters = { locationId: url.searchParams.get('locationId') ?? undefined, itemId: url.searchParams.get('itemId') ?? undefined, belowReorderLevel: url.searchParams.get('belowReorderLevel') === 'true' };
  const report = await getStockReport(pgPool, tenantSlug, filters);
  return NextResponse.json(report);
}
