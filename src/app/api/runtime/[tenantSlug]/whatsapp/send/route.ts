/**
 * POST /api/runtime/[tenantSlug]/whatsapp/send
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { WhatsAppSender } from '@/platform/integrations/whatsapp/whatsapp-sender';
import { decryptSecret } from '@/platform/integrations/secrets';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';

interface RouteContext {
  params: Promise<{ tenantSlug: string }>;
}

const ParameterSchema = z.object({
  type: z.enum(['text', 'image', 'document']),
  text: z.string().optional(),
  image: z.object({ link: z.string().url() }).optional(),
  document: z.object({ link: z.string().url() }).optional(),
});

const ComponentSchema = z.object({
  type: z.enum(['header', 'body', 'button']),
  parameters: z.array(ParameterSchema),
});

const SendSchema = z.object({
  appId: z.string().uuid(),
  to: z.string().min(1),
  templateName: z.string().min(1),
  languageCode: z.string().default('en_US'),
  components: z.array(ComponentSchema).optional(),
});

export async function POST(
  req: NextRequest,
  _ctx: RouteContext,
): Promise<NextResponse> {
  const body: unknown = await req.json();
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { appId, to, templateName, languageCode, components } = parsed.data;

  const configRow = await pgPool.query<{
    phone_number_id: string;
    access_token: string;
    verify_token: string;
  }>(
    `SELECT phone_number_id, access_token, verify_token FROM platform.whatsapp_configs
     WHERE app_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [appId],
  );

  if (configRow.rows.length === 0) {
    throw new NotConfiguredError(`No WhatsApp config found for app ${appId}`);
  }

  const row = configRow.rows[0];
  const sender = new WhatsAppSender({
    phoneNumberId: row.phone_number_id,
    accessToken: decryptSecret(row.access_token, appId),
    verifyToken: row.verify_token,
  });

  const result = await sender.send({ to, templateName, languageCode, components });

  await pgPool
    .query(
      `INSERT INTO platform.whatsapp_log (app_id, to_phone, template_name, status, message_id)
       VALUES ($1, $2, $3, 'sent', $4)`,
      [appId, to, templateName, result.messageId],
    )
    .catch(() => { /* best-effort */ });

  return NextResponse.json({ messageId: result.messageId }, { status: 200 });
}
