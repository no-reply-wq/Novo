import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getRateQuotes } from '@/platform/courier/service';
import type { ShipmentRequest } from '@/platform/courier/types';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { request?: Omit<ShipmentRequest, 'orderId'>; tenantSlug?: string };
    const { request, tenantSlug } = body;
    if (!request || !tenantSlug) return NextResponse.json({ error: 'request and tenantSlug are required' }, { status: 400 });
    const quotes = await getRateQuotes(request, tenantSlug, pgPool);
    return NextResponse.json({ quotes });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
