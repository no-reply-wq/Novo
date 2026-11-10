/**
 * GET /api/runtime/[tenantSlug]/whatsapp/log?appId=&limit=&offset=
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { requireTenantSession } from '@/lib/auth/tenant-session';

interface RouteContext {
  params: Promise<{ tenantSlug: string }>;
}

export async function GET(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { tenantSlug } = await params;
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const appId = req.nextUrl.searchParams.get('appId');
  if (!appId) {
    return NextResponse.json({ error: 'appId is required' }, { status: 400 });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10);

  const result = await pgPool.query<{
    id: string;
    to_phone: string;
    template_name: string;
    status: string;
    message_id: string | null;
    error: string | null;
    sent_at: Date;
  }>(
    `SELECT id, to_phone, template_name, status, message_id, error, sent_at
     FROM platform.whatsapp_log WHERE app_id = $1 ORDER BY sent_at DESC LIMIT $2 OFFSET $3`,
    [appId, limit, offset],
  );

  return NextResponse.json({ log: result.rows }, { status: 200 });
}
