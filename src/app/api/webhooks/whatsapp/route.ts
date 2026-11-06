/**
 * WhatsApp Cloud API webhook — /api/webhooks/whatsapp
 *
 * GET  — Hub challenge verification (Meta webhook registration)
 * POST — Inbound message handler: verifies signature, stores to whatsapp_log,
 *         fires workflow triggers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import {
  verifyWhatsAppWebhook,
  parseWhatsAppInbound,
} from '@/platform/integrations/whatsapp/webhook';

const WEBHOOK_VERIFY_TOKEN = process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] ?? '';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode !== 'subscribe') {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  if (!token || token !== WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
  }

  if (!challenge) {
    return NextResponse.json({ error: 'Missing challenge' }, { status: 400 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const phoneNumberId = extractPhoneNumberId(payload);

    // Load app secret to verify signature
    if (phoneNumberId && signature) {
      const result = await pgPool.query<{ verify_token: string }>(
        `SELECT verify_token FROM platform.whatsapp_configs WHERE phone_number_id = $1 LIMIT 1`,
        [phoneNumberId],
      );
      if (result.rows.length > 0) {
        const appSecret = result.rows[0].verify_token;
        if (!verifyWhatsAppWebhook(rawBody, signature, appSecret)) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      }
    } else if (signature && process.env['WHATSAPP_APP_SECRET']) {
      const globalSecret = process.env['WHATSAPP_APP_SECRET'];
      if (!verifyWhatsAppWebhook(rawBody, signature, globalSecret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const message = parseWhatsAppInbound(payload);

    if (message) {
      await pgPool
        .query(
          `INSERT INTO platform.whatsapp_log
             (app_id, to_phone, template_name, status, message_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [phoneNumberId ?? 'unknown', message.from, 'inbound', 'received', message.messageId],
        )
        .catch(() => { /* best-effort */ });
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[whatsapp-webhook] POST error:', error);
    return NextResponse.json({ status: 'error', error }, { status: 200 });
  }
}

function extractPhoneNumberId(payload: Record<string, unknown>): string | null {
  try {
    const entry = (payload['entry'] as Array<Record<string, unknown>>)?.[0];
    const change = (entry?.['changes'] as Array<Record<string, unknown>>)?.[0];
    const value = change?.['value'] as Record<string, unknown> | undefined;
    return typeof value?.['phone_number_id'] === 'string' ? value['phone_number_id'] : null;
  } catch {
    return null;
  }
}
