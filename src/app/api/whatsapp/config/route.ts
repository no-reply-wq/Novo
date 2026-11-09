/**
 * GET  /api/whatsapp/config?tenantSlug=xxx  — return config (access_token omitted)
 * POST /api/whatsapp/config?tenantSlug=xxx  — upsert config
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS platform.whatsapp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_slug TEXT UNIQUE NOT NULL,
    access_token TEXT,
    phone_number_id TEXT,
    waba_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug');
  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenantSlug query param required' }, { status: 400 });
  }

  const client = await pgPool.connect();
  try {
    await client.query(ENSURE_TABLE);
    const result = await client.query<{
      id: string;
      tenant_slug: string;
      phone_number_id: string | null;
      waba_id: string | null;
      created_at: string;
      updated_at: string;
    }>(
      'SELECT id, tenant_slug, phone_number_id, waba_id, created_at, updated_at FROM platform.whatsapp_configs WHERE tenant_slug = $1 LIMIT 1',
      [tenantSlug],
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ config: null });
    }

    return NextResponse.json({ config: result.rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}

interface ConfigBody {
  accessToken?: string;
  phoneNumberId?: string;
  wabaId?: string;
}

export async function POST(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenantSlug');
  if (!tenantSlug) {
    return NextResponse.json({ error: 'tenantSlug query param required' }, { status: 400 });
  }

  let body: ConfigBody;
  try {
    body = (await req.json()) as ConfigBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const client = await pgPool.connect();
  try {
    await client.query(ENSURE_TABLE);

    await client.query(
      `INSERT INTO platform.whatsapp_configs (tenant_slug, access_token, phone_number_id, waba_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_slug) DO UPDATE SET
         access_token = COALESCE(EXCLUDED.access_token, platform.whatsapp_configs.access_token),
         phone_number_id = COALESCE(EXCLUDED.phone_number_id, platform.whatsapp_configs.phone_number_id),
         waba_id = COALESCE(EXCLUDED.waba_id, platform.whatsapp_configs.waba_id),
         updated_at = NOW()`,
      [tenantSlug, body.accessToken ?? null, body.phoneNumberId ?? null, body.wabaId ?? null],
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
