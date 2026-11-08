import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { trackShipment } from '@/platform/courier/service';
import type { CourierProvider } from '@/platform/courier/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ awbNumber: string }> }): Promise<NextResponse> {
  try {
    const { awbNumber } = await params;
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider') as CourierProvider | null;
    const tenantSlug = searchParams.get('tenantSlug');
    if (!provider || !tenantSlug) return NextResponse.json({ error: 'provider and tenantSlug query params are required' }, { status: 400 });
    const events = await trackShipment(awbNumber, provider, tenantSlug, pgPool);
    return NextResponse.json({ awbNumber, events });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
