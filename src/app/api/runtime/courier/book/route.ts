import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { bookShipment } from '@/platform/courier/service';
import type { CourierProvider, ShipmentRequest } from '@/platform/courier/types';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { provider?: CourierProvider; request?: ShipmentRequest; tenantSlug?: string };
    const { provider, request, tenantSlug } = body;
    if (!provider || !request || !tenantSlug) return NextResponse.json({ error: 'provider, request, and tenantSlug are required' }, { status: 400 });
    const response = await bookShipment(provider, request, tenantSlug, pgPool);
    return NextResponse.json(response, { status: 201 });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
