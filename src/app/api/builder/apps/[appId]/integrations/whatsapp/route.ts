/**
 * GET /api/builder/apps/[appId]/integrations/whatsapp  — fetch whatsapp config
 * PUT /api/builder/apps/[appId]/integrations/whatsapp  — upsert whatsapp config
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

const WhatsAppConfigSchema = z.object({
  phoneNumberId: z.string().min(1),
  accessToken: z.string().min(1),
  verifyToken: z.string().min(1),
});

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { appId } = await ctx.params;

  const result = await pgPool.query<{
    id: string;
    phone_number_id: string;
    verify_token: string;
  }>(
    `SELECT id, phone_number_id, verify_token
     FROM platform.whatsapp_configs
     WHERE app_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [appId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ config: null }, { status: 200 });
  }

  const row = result.rows[0];
  return NextResponse.json(
    {
      id: row.id,
      config: {
        phoneNumberId: row.phone_number_id,
        // access_token masked — never send to client
        accessToken: '***',
        verifyToken: row.verify_token,
      },
    },
    { status: 200 },
  );
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
  const parsed = WhatsAppConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { phoneNumberId, accessToken, verifyToken } = parsed.data;
  const encryptedToken = encryptSecret(accessToken, appId);

  await pgPool.query(
    `INSERT INTO platform.whatsapp_configs (app_id, phone_number_id, access_token, verify_token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (app_id) DO UPDATE
       SET phone_number_id = EXCLUDED.phone_number_id,
           access_token = EXCLUDED.access_token,
           verify_token = EXCLUDED.verify_token`,
    [appId, phoneNumberId, encryptedToken, verifyToken],
  );

  return NextResponse.json({ ok: true }, { status: 200 });
}
