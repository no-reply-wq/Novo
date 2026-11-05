/**
 * WhatsApp Cloud API webhook endpoint.
 *
 * GET  — Hub challenge verification (Meta webhook registration)
 * POST — Inbound message handler (fires workflow triggers)
 *
 * Security: POST requests are verified via X-Hub-Signature-256 header
 * before any processing. The app secret is loaded from the tenant's
 * whatsapp_meta integration config.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { verifyWhatsAppWebhook, parseWhatsAppInbound } from '@/platform/integrations/whatsapp/webhook';
import { decryptSecret } from '@/platform/integrations/secrets';

const WEBHOOK_VERIFY_TOKEN = process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] ?? '';

/**
 * GET — Meta Hub challenge verification.
 * Called once during webhook registration in Meta Developer Console.
 */
export async function GET(req: NextRequest) {
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

  // Return the challenge as plain text (Meta requirement)
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

/**
 * POST — Inbound message handler.
 * Verifies signature, parses message, and triggers platform workflows.
 */
export async function POST(req: NextRequest) {
  // Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';

  // Look up the app secret from the tenant's whatsapp_meta integration.
  // We try to find a matching integration by phoneNumberId if provided in payload.
  let appSecret: string | null = null;

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    // Extract phone number ID from payload to find the right tenant
    const phoneNumberId = extractPhoneNumberId(payload);

    if (phoneNumberId) {
      const result = await pgPool.query<{ tenant_slug: string; config: Record<string, string> }>(
        `SELECT tenant_slug, config
         FROM platform.integration_configs
         WHERE type = 'whatsapp_meta' AND enabled = true
           AND config->>'phoneNumberId' = $1
         LIMIT 1`,
        [phoneNumberId]
      );

      if (result.rows.length > 0) {
        const { tenant_slug, config } = result.rows[0];
        if (config['appSecret']) {
          appSecret = decryptSecret(config['appSecret'], tenant_slug);
        }
      }
    }
  } catch {
    // If we can't load the config, we still reject below if signature check fails
  }

  // If no app secret found, reject with 403
  if (!appSecret) {
    return NextResponse.json({ error: 'Unknown sender' }, { status: 403 });
  }

  // Verify signature
  if (!verifyWhatsAppWebhook(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  // Parse the inbound message
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = parseWhatsAppInbound(body);

  if (message) {
    // Log the inbound message (best-effort)
    await pgPool
      .query(
        `INSERT INTO public.whatsapp_log
           (app_id, connector_id, to_number, message_id, direction, status, raw_payload)
         VALUES (NULL, NULL, $1, $2, 'inbound', 'received', $3)`,
        [message.from, message.messageId, JSON.stringify(body)]
      )
      .catch(() => { /* best-effort */ });

    // TODO: fire workflow triggers for inbound WhatsApp messages
    // triggerWorkflows({ event: 'whatsapp_message_received', payload: message });
  }

  // Meta expects a 200 response within 20 seconds
  return NextResponse.json({ received: true });
}

/** Extract the phone_number_id from a Meta webhook payload. */
function extractPhoneNumberId(payload: Record<string, unknown>): string | null {
  try {
    const entry = payload['entry'];
    if (!Array.isArray(entry) || entry.length === 0) return null;
    const changes = (entry[0] as Record<string, unknown>)['changes'];
    if (!Array.isArray(changes) || changes.length === 0) return null;
    const value = (changes[0] as Record<string, unknown>)['value'];
    if (!value || typeof value !== 'object') return null;
    const metadata = (value as Record<string, unknown>)['metadata'];
    if (!metadata || typeof metadata !== 'object') return null;
    const id = (metadata as Record<string, unknown>)['phone_number_id'];
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}
