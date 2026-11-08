/**
 * POST /api/notifications/read-all — mark all notifications as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { markAllRead } from '@/platform/notifications/service';

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.tenantSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await markAllRead(session.user.tenantSlug, session.user.id, pgPool);
  return NextResponse.json({ ok: true });
}
