/**
 * Runtime API — Full stock report.
 * GET /api/runtime/[tenantSlug]/stock/report?locationId=&itemId=&belowReorderLevel=
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getStockReport } from '@/platform/stock/engine';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ tenantSlug: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { tenantSlug } = await params;
  const url = req.nextUrl;

  const locationId = url.searchParams.get('locationId') ?? undefined;
  const itemId = url.searchParams.get('itemId') ?? undefined;
  const belowReorderLevel = url.searchParams.get('belowReorderLevel') === 'true';

  const balances = await getStockReport(pgPool, tenantSlug, {
    locationId,
    itemId,
    belowReorderLevel: belowReorderLevel || undefined,
  });

  return NextResponse.json({ balances, count: balances.length });
}
