import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getRateQuotes } from '@/platform/courier/service';
import type { ShipmentRequest } from '@/platform/courier/types';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await req.json()) as { request?: Omit<ShipmentRequest, 'orderId'> };
    const { request } = body;
    if (!request) return NextResponse.json({ error: 'request is required' }, { status: 400 });
    const quotes = await getRateQuotes(request, ctx.tenant.slug, pgPool);
    return NextResponse.json({ quotes });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
