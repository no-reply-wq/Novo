/**
 * GET /api/runtime/versioning/[appId]/[tableApiKey]/[recordId]/diff?a=0&b=1
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { compareQuoteVersions } from '@/platform/versioning/quote-versions';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string; tableApiKey: string; recordId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { recordId } = await params;
  const a = parseInt(req.nextUrl.searchParams.get('a') ?? '', 10);
  const b = parseInt(req.nextUrl.searchParams.get('b') ?? '', 10);
  if (isNaN(a) || isNaN(b)) return NextResponse.json({ error: 'a and b query params required' }, { status: 400 });

  try {
    const diff = await compareQuoteVersions(recordId, a, b, pgPool);
    return NextResponse.json({ diff });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
