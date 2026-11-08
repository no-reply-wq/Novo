/**
 * GET /api/notifications — list notifications for the authenticated user
 * Query: ?unreadOnly=true&limit=20&offset=0
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { getNotifications } from '@/platform/notifications/service';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.tenantSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const notifications = await getNotifications(
    session.user.tenantSlug,
    session.user.id,
    { unreadOnly, limit, offset },
    pgPool,
  );

  return NextResponse.json({ notifications });
}
