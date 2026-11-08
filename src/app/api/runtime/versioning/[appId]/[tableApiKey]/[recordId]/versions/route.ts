/**
 * GET  /api/runtime/versioning/[appId]/[tableApiKey]/[recordId]/versions  — list versions
 * POST /api/runtime/versioning/[appId]/[tableApiKey]/[recordId]/versions  — create new version
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { listQuoteVersions, createQuoteVersion } from '@/platform/versioning/quote-versions';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string; tableApiKey: string; recordId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { appId, tableApiKey, recordId } = await params;
  if (!appId || !tableApiKey || !recordId) {
    return NextResponse.json({ error: 'Missing route params' }, { status: 400 });
  }
  try {
    const versions = await listQuoteVersions(recordId, pgPool);
    return NextResponse.json({ versions });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { appId, tableApiKey, recordId } = await params;
  const tenantSlug = ctx.tenant.slug;
  const userId = ctx.userId;

  let note: string | undefined;
  try {
    const body = (await req.json()) as { note?: string };
    note = body.note;
  } catch {
    // no body — fine
  }

  try {
    const version = await createQuoteVersion(appId, tenantSlug, recordId, tableApiKey, userId, note, pgPool);
    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
