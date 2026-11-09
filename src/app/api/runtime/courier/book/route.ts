import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { bookShipment } from '@/platform/courier/service';
import type { CourierProvider, ShipmentRequest } from '@/platform/courier/types';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await req.json()) as { provider?: CourierProvider; request?: ShipmentRequest };
    const { provider, request } = body;
    if (!provider || !request) return NextResponse.json({ error: 'provider and request are required' }, { status: 400 });
    const response = await bookShipment(provider, request, ctx.tenant.slug, pgPool);
    return NextResponse.json(response, { status: 201 });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
