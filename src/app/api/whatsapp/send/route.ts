/**
 * POST /api/whatsapp/send
 * Send a WhatsApp message via Meta Cloud API for a given tenant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender';

const ENSURE_CONFIG_TABLE = `
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

const ENSURE_LOGS_TABLE = `
  CREATE TABLE IF NOT EXISTS platform.whatsapp_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_slug TEXT NOT NULL,
    to_number TEXT NOT NULL,
    message_type TEXT NOT NULL,
    status TEXT NOT NULL,
    meta_message_id TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

interface SendBody {
  tenantSlug: string;
  to: string;
  type: 'text' | 'template';
  text?: string;
  templateName?: string;
  templateParams?: string[];
}

export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tenantSlug, to, type, text, templateName, templateParams } = body;

  if (!tenantSlug || !to || !type) {
    return NextResponse.json({ error: 'tenantSlug, to, and type are required' }, { status: 400 });
  }

  const client = await pgPool.connect();
  try {
    await client.query(ENSURE_CONFIG_TABLE);
    await client.query(ENSURE_LOGS_TABLE);

    const configResult = await client.query<{
      access_token: string;
      phone_number_id: string;
    }>(
      'SELECT access_token, phone_number_id FROM platform.whatsapp_configs WHERE tenant_slug = $1 LIMIT 1',
      [tenantSlug],
    );

    if (configResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'WhatsApp is not configured for this tenant' },
        { status: 404 },
      );
    }

    const { access_token, phone_number_id } = configResult.rows[0];

    const result = await sendWhatsAppMessage({
      to,
      accessToken: access_token,
      phoneNumberId: phone_number_id,
      ...(type === 'template' ? { templateName, templateParams } : { text }),
    });

    await client.query(
      `INSERT INTO platform.whatsapp_logs
        (tenant_slug, to_number, message_type, status, meta_message_id, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantSlug,
        to,
        type,
        result.success ? 'sent' : 'failed',
        result.messageId ?? null,
        result.error ?? null,
      ],
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
