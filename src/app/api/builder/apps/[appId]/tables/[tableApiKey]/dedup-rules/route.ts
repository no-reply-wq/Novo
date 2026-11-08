/**
 * GET /api/builder/apps/[appId]/tables/[tableApiKey]/dedup-rules
 * PUT /api/builder/apps/[appId]/tables/[tableApiKey]/dedup-rules
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getDedupRules, saveDedupRules } from '@/platform/dedup/detector';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string; tableApiKey: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  const { appId, tableApiKey } = await params;
  const rules = await getDedupRules(appId, tableApiKey, pgPool);
  return NextResponse.json({ rules });
}

export async function PUT(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;
  const { appId, tableApiKey } = await params;
  const body = (await req.json()) as { rules: Parameters<typeof saveDedupRules>[2] };
  if (!Array.isArray(body.rules)) return NextResponse.json({ error: 'rules array required' }, { status: 400 });
  await saveDedupRules(appId, tableApiKey, body.rules, pgPool);
  return NextResponse.json({ ok: true });
}
