import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type { CourierProvider, ShipmentRequest, ShipmentResponse, TrackingEvent } from './types';
import * as delhivery from './providers/delhivery';
import * as shiprocket from './providers/shiprocket';

async function getApiKey(provider: CourierProvider, tenantSlug: string, pgPool: Pool): Promise<string> {
  const res = await pgPool.query<{ secret_value: string }>(
    `SELECT secret_value FROM platform.tenant_secrets WHERE tenant_slug = $1 AND secret_key = $2`,
    [tenantSlug, `courier_${provider}_api_key`],
  );
  if (!res.rows.length) throw new Error(`No API key configured for courier provider "${provider}" on tenant "${tenantSlug}"`);
  return res.rows[0].secret_value;
}

function getProvider(provider: CourierProvider) {
  switch (provider) {
    case 'delhivery': return delhivery;
    case 'shiprocket': return shiprocket;
    case 'bluedart': throw new Error('BlueDart provider not yet implemented');
    case 'dtdc': throw new Error('DTDC provider not yet implemented');
    default: { const _e: never = provider; throw new Error(`Unknown provider: ${String(_e)}`); }
  }
}

export async function bookShipment(provider: CourierProvider, request: ShipmentRequest, tenantSlug: string, pgPool: Pool): Promise<ShipmentResponse> {
  const apiKey = await getApiKey(provider, tenantSlug, pgPool);
  const prov = getProvider(provider);
  const response = await prov.createShipment(request, apiKey);
  const id = randomUUID();
  await pgPool.query(
    `INSERT INTO platform.shipments (id, tenant_slug, record_id, provider, awb_number, tracking_number, status, charges) VALUES ($1, $2, $3, $4, $5, $6, 'booked', $7) ON CONFLICT (id) DO NOTHING`,
    [id, tenantSlug, request.orderId, provider, response.awbNumber, response.trackingNumber, response.charges ?? null],
  );
  return response;
}

export async function trackShipment(awbNumber: string, provider: CourierProvider, tenantSlug: string, pgPool: Pool): Promise<TrackingEvent[]> {
  const apiKey = await getApiKey(provider, tenantSlug, pgPool);
  return getProvider(provider).trackShipment(awbNumber, apiKey);
}

export async function getRateQuotes(request: Omit<ShipmentRequest, 'orderId'>, tenantSlug: string, pgPool: Pool): Promise<Array<{ provider: CourierProvider; rate: number; eta: string }>> {
  const providers: CourierProvider[] = ['delhivery', 'shiprocket'];
  const results: Array<{ provider: CourierProvider; rate: number; eta: string }> = [];
  await Promise.allSettled(providers.map(async (p) => {
    try {
      const apiKey = await getApiKey(p, tenantSlug, pgPool);
      const prov = getProvider(p);
      const dummyReq: ShipmentRequest = { ...request, orderId: `rate-quote-${Date.now()}` };
      const resp = await prov.createShipment(dummyReq, apiKey);
      try { await prov.cancelShipment(resp.awbNumber, apiKey); } catch { /* ignore */ }
      results.push({ provider: p, rate: resp.charges ?? 0, eta: resp.estimatedDelivery ?? 'Unknown' });
    } catch { /* skip unconfigured providers */ }
  }));
  return results.sort((a, b) => a.rate - b.rate);
}
