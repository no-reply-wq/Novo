import { NextRequest, NextResponse } from 'next/server';
import { requireSessionTenant } from '@/lib/auth/tenant-session';
import { prisma } from '@/lib/db/client';
import type { BankReconConfig } from '@/platform/integrations/bankrecon/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const appId = searchParams.get('appId');
  if (!appId) {
    return NextResponse.json({ error: 'Missing appId' }, { status: 400 });
  }

  const rows = await prisma.$queryRaw<Array<{ config: unknown }>>`
    SELECT config FROM platform.bankrecon_configs
    WHERE tenant_slug = ${ctx.tenant.slug} AND app_id = ${appId}::uuid
  `;

  if (!rows.length) {
    return NextResponse.json({ config: null });
  }

  return NextResponse.json({ config: rows[0].config });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { appId, config } = body as { appId: string; config: BankReconConfig };

  if (!appId || !config) {
    return NextResponse.json({ error: 'Missing appId or config' }, { status: 400 });
  }

  await prisma.$executeRaw`
    INSERT INTO platform.bankrecon_configs (tenant_slug, app_id, config)
    VALUES (${ctx.tenant.slug}, ${appId}::uuid, ${JSON.stringify(config)}::jsonb)
    ON CONFLICT (tenant_slug, app_id) DO UPDATE
    SET config = EXCLUDED.config
  `;

  return NextResponse.json({ success: true });
}
