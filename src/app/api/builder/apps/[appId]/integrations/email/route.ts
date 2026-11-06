/**
 * GET  /api/builder/apps/[appId]/integrations/email  — fetch email config
 * PUT  /api/builder/apps/[appId]/integrations/email  — upsert email config
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { encryptSecret } from '@/platform/integrations/secrets';

interface RouteContext {
  params: Promise<{ appId: string }>;
}

const EmailConfigSchema = z.object({
  provider: z.enum(['smtp', 'ses', 'resend']),
  fromAddress: z.string().email(),
  fromName: z.string().default(''),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  sesRegion: z.string().optional(),
  sesAccessKeyId: z.string().optional(),
  sesSecretAccessKey: z.string().optional(),
  resendApiKey: z.string().optional(),
});

type EmailConfigInput = z.infer<typeof EmailConfigSchema>;

function encryptSensitiveFields(config: EmailConfigInput, appId: string): EmailConfigInput {
  const out = { ...config };
  if (out.smtpPass) out.smtpPass = encryptSecret(out.smtpPass, appId);
  if (out.sesSecretAccessKey)
    out.sesSecretAccessKey = encryptSecret(out.sesSecretAccessKey, appId);
  if (out.resendApiKey) out.resendApiKey = encryptSecret(out.resendApiKey, appId);
  return out;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appId } = await ctx.params;

  const result = await pgPool.query<{ id: string; config: unknown }>(
    `SELECT id, config FROM platform.email_configs WHERE app_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [appId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ config: null }, { status: 200 });
  }

  const row = result.rows[0];
  // Mask sensitive fields before returning
  const config = row.config as Record<string, unknown>;
  if (config['smtpPass']) config['smtpPass'] = '***';
  if (config['sesSecretAccessKey']) config['sesSecretAccessKey'] = '***';
  if (config['resendApiKey']) config['resendApiKey'] = '***';

  return NextResponse.json({ id: row.id, config }, { status: 200 });
}

export async function PUT(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appId } = await ctx.params;

  const body: unknown = await req.json();
  const parsed = EmailConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const encrypted = encryptSensitiveFields(parsed.data, appId);

  await pgPool.query(
    `INSERT INTO platform.email_configs (app_id, config)
     VALUES ($1, $2)
     ON CONFLICT (app_id) DO UPDATE
       SET config = EXCLUDED.config, updated_at = now()`,
    [appId, JSON.stringify(encrypted)],
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
