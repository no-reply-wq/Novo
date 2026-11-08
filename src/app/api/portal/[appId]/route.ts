/**
 * GET /api/portal/[appId]?token=...
 * Returns portal config and customer info (used by portal page).
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { validatePortalToken, getPortalConfig } from '@/platform/portal/service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { appId } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 401 });

  const portalToken = await validatePortalToken(token);
  if (!portalToken) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  if (portalToken.appId !== appId) return NextResponse.json({ error: 'Token app mismatch' }, { status: 403 });

  try {
    const config = await getPortalConfig(appId, pgPool);
    return NextResponse.json({ config, customer: { email: portalToken.email } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
