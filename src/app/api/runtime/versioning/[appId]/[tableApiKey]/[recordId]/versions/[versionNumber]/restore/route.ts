/**
 * POST /api/runtime/versioning/[appId]/[tableApiKey]/[recordId]/versions/[versionNumber]/restore
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { restoreQuoteVersion } from '@/platform/versioning/quote-versions';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string; tableApiKey: string; recordId: string; versionNumber: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { appId, tableApiKey, recordId, versionNumber } = await params;
  const tenantSlug = ctx.tenant.slug;
  const userId = ctx.userId;
  const verNum = parseInt(versionNumber, 10);
  if (isNaN(verNum)) return NextResponse.json({ error: 'Invalid versionNumber' }, { status: 400 });

  try {
    await restoreQuoteVersion(appId, tenantSlug, recordId, tableApiKey, verNum, userId, pgPool);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
