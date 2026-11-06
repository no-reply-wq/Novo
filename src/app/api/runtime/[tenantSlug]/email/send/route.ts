/**
 * POST /api/runtime/[tenantSlug]/email/send
 *
 * Send an email using the app's configured email provider.
 * Optionally render from a saved template.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { EmailSender } from '@/platform/integrations/email/email-sender';
import { decryptSecret } from '@/platform/integrations/secrets';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';
import type { EmailConfig, EmailTemplate, SendEmailInput } from '@/platform/integrations/email/types';

interface RouteContext {
  params: Promise<{ tenantSlug: string }>;
}

const SendSchema = z.object({
  appId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  templateData: z.record(z.string(), z.unknown()).optional(),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const { tenantSlug: _tenantSlug } = await ctx.params;

  const body: unknown = await req.json();
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { appId, templateId, templateData, ...rest } = parsed.data;

  // Load email config
  const configRow = await pgPool.query<{ config: Record<string, unknown> }>(
    `SELECT config FROM platform.email_configs WHERE app_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [appId],
  );

  if (configRow.rows.length === 0) {
    throw new NotConfiguredError(`No email config found for app ${appId}`);
  }

  const rawConfig = configRow.rows[0].config as Record<string, unknown>;

  // Decrypt sensitive fields
  if (rawConfig['smtpPass']) {
    rawConfig['smtpPass'] = decryptSecret(String(rawConfig['smtpPass']), appId);
  }
  if (rawConfig['sesSecretAccessKey']) {
    rawConfig['sesSecretAccessKey'] = decryptSecret(
      String(rawConfig['sesSecretAccessKey']),
      appId,
    );
  }
  if (rawConfig['resendApiKey']) {
    rawConfig['resendApiKey'] = decryptSecret(String(rawConfig['resendApiKey']), appId);
  }

  const config = rawConfig as unknown as EmailConfig;
  const sender = new EmailSender(config);

  let result: { messageId: string; provider: string; sentAt: Date };

  if (templateId) {
    const tplRow = await pgPool.query<{
      id: string;
      app_id: string;
      name: string;
      subject: string;
      body_html: string;
      body_text: string | null;
    }>(
      `SELECT id, app_id, name, subject, body_html, body_text
       FROM platform.email_templates WHERE id = $1 AND app_id = $2`,
      [templateId, appId],
    );

    if (tplRow.rows.length === 0) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const tpl = tplRow.rows[0];
    const template: EmailTemplate = {
      id: tpl.id,
      appId: tpl.app_id,
      name: tpl.name,
      subject: tpl.subject,
      bodyHtml: tpl.body_html,
      bodyText: tpl.body_text ?? undefined,
    };

    const overrides: Partial<SendEmailInput> = { to: rest.to };
    if (rest.cc) overrides.cc = rest.cc;
    if (rest.bcc) overrides.bcc = rest.bcc;
    if (rest.subject) overrides.subject = rest.subject;
    if (rest.bodyHtml) overrides.bodyHtml = rest.bodyHtml;
    if (rest.bodyText) overrides.bodyText = rest.bodyText;

    result = await sender.sendTemplate(template, templateData ?? {}, overrides);
  } else {
    if (!rest.subject || !rest.bodyHtml) {
      return NextResponse.json(
        { error: 'subject and bodyHtml are required when not using a template' },
        { status: 400 },
      );
    }

    result = await sender.send({
      to: rest.to,
      cc: rest.cc,
      bcc: rest.bcc,
      subject: rest.subject,
      bodyHtml: rest.bodyHtml,
      bodyText: rest.bodyText,
    });
  }

  // Log to email_log
  const toAddresses = Array.isArray(rest.to) ? rest.to : [rest.to];
  await pgPool
    .query(
      `INSERT INTO platform.email_log
         (app_id, template_id, to_addresses, subject, status, message_id)
       VALUES ($1, $2, $3, $4, 'sent', $5)`,
      [appId, templateId ?? null, toAddresses, rest.subject ?? '(template)', result.messageId],
    )
    .catch(() => { /* best-effort logging */ });

  return NextResponse.json(
    { messageId: result.messageId, provider: result.provider, sentAt: result.sentAt },
    { status: 200 },
  );
}
