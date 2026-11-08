/**
 * GET /api/builder/apps/[appId]/portal-config
 * PUT /api/builder/apps/[appId]/portal-config
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getPortalConfig, savePortalConfig } from '@/platform/portal/service';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  const { appId } = await params;
  const config = await getPortalConfig(appId, pgPool);
  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  const { appId } = await params;
  const body = await req.json() as Parameters<typeof savePortalConfig>[1];
  await savePortalConfig(appId, body, pgPool);
  return NextResponse.json({ ok: true });
}
