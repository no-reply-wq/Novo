/**
 * Runtime API — Stock balance for a specific item + location.
 * GET /api/runtime/[tenantSlug]/stock/balance?itemId=&locationId=&batchNo=
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getStockBalance } from '@/platform/stock/engine';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ tenantSlug: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { tenantSlug } = await params;
  const url = req.nextUrl;

  const itemId = url.searchParams.get('itemId');
  const locationId = url.searchParams.get('locationId');
  const batchNo = url.searchParams.get('batchNo') ?? undefined;

  if (!itemId || !locationId) {
    return NextResponse.json(
      { error: 'itemId and locationId query params are required' },
      { status: 400 },
    );
  }

  const balance = await getStockBalance(pgPool, tenantSlug, itemId, locationId, batchNo);
  return NextResponse.json(balance);
}
