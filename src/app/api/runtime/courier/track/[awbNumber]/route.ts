import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { trackShipment } from '@/platform/courier/service';
import type { CourierProvider } from '@/platform/courier/types';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export async function GET(req: NextRequest, { params }: { params: Promise<{ awbNumber: string }> }): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { awbNumber } = await params;
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider') as CourierProvider | null;
    if (!provider) return NextResponse.json({ error: 'provider query param is required' }, { status: 400 });
    const events = await trackShipment(awbNumber, provider, ctx.tenant.slug, pgPool);
    return NextResponse.json({ awbNumber, events });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
