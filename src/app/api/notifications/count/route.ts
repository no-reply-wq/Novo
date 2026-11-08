/**
 * GET /api/notifications/count — returns { unread: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { getUnreadCount } from '@/platform/notifications/service';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.tenantSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const unread = await getUnreadCount(session.user.tenantSlug, session.user.id, pgPool);
  return NextResponse.json({ unread });
}
