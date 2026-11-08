import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import type { CourierProvider } from '@/platform/courier/types';
import * as delhivery from '@/platform/courier/providers/delhivery';
import * as shiprocket from '@/platform/courier/providers/shiprocket';

async function getApiKey(provider: CourierProvider, tenantSlug: string): Promise<string> {
  const res = await pgPool.query<{ secret_value: string }>(
    `SELECT secret_value FROM platform.tenant_secrets WHERE tenant_slug = $1 AND secret_key = $2`,
    [tenantSlug, `courier_${provider}_api_key`],
  );
  if (!res.rows.length) throw new Error(`No API key for provider "${provider}"`);
  return res.rows[0].secret_value;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ awbNumber: string }> }): Promise<NextResponse> {
  try {
    const { awbNumber } = await params;
    const body = (await req.json()) as { provider?: CourierProvider; tenantSlug?: string };
    const { provider, tenantSlug } = body;
    if (!provider || !tenantSlug) return NextResponse.json({ error: 'provider and tenantSlug are required' }, { status: 400 });
    const apiKey = await getApiKey(provider, tenantSlug);
    if (provider === 'delhivery') await delhivery.cancelShipment(awbNumber, apiKey);
    else if (provider === 'shiprocket') await shiprocket.cancelShipment(awbNumber, apiKey);
    else throw new Error(`Cancel not implemented for provider: ${provider}`);
    await pgPool.query(`UPDATE platform.shipments SET status = 'cancelled' WHERE awb_number = $1 AND tenant_slug = $2`, [awbNumber, tenantSlug]);
    return NextResponse.json({ success: true, awbNumber });
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
