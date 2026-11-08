/**
 * GET /api/portal/[appId]/records/[tableApiKey]?token=...
 * Returns the customer's filtered records.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { validatePortalToken, getPortalRecords } from '@/platform/portal/service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string; tableApiKey: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { tableApiKey } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 401 });

  const portalToken = await validatePortalToken(token);
  if (!portalToken) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  try {
    const records = await getPortalRecords(portalToken, tableApiKey, pgPool);
    return NextResponse.json({ records });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
