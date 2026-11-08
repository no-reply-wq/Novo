/**
 * POST /api/builder/apps/[appId]/portal/invite
 * Body: { email, tenantSlug }
 * Generates a portal token and returns it (email sending is out of scope here).
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { generatePortalToken } from '@/platform/portal/service';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  const { appId } = await params;
  const tenantSlug = ctx.tenant.slug;
  const body = (await req.json()) as { email?: string };
  if (!body.email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const portalToken = await generatePortalToken(body.email, appId, tenantSlug, pgPool);
  return NextResponse.json({ token: portalToken.token, expiresAt: portalToken.expiresAt });
}
