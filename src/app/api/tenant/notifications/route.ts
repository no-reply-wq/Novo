/**
 * In-App Notifications API
 * GET  — fetch unread notifications for current user
 * POST — mark notifications as read
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

async function ensureNotifications(schemaName: string) {
  await tenantQuery(schemaName, `
    CREATE TABLE IF NOT EXISTS notifications (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      body        TEXT,
      link        TEXT,
      read        BOOLEAN NOT NULL DEFAULT false,
      entity_type TEXT,
      entity_id   TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await tenantQuery(schemaName, `
    CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id, read, created_at DESC)
  `);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  await ensureNotifications(ctx.schemaName);

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const onlyUnread = searchParams.get('unread') === 'true';

  const rows = await tenantQuery(
    ctx.schemaName,
    `SELECT * FROM notifications
     WHERE user_id = $1 ${onlyUnread ? 'AND read = false' : ''}
     ORDER BY created_at DESC
     LIMIT $2`,
    [ctx.tenantUserId, limit]
  );

  const unreadCount = await tenantQuery<{ count: string }>(
    ctx.schemaName,
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false',
    [ctx.tenantUserId]
  );

  return NextResponse.json({
    notifications: rows.rows,
    unreadCount: parseInt(unreadCount.rows[0]?.count ?? '0', 10),
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  await ensureNotifications(ctx.schemaName);

  const body = await req.json().catch(() => ({}));

  if (body.action === 'mark_all_read') {
    await tenantQuery(
      ctx.schemaName,
      'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
      [ctx.tenantUserId]
    );
    return NextResponse.json({ success: true });
  }

  if (body.action === 'mark_read' && body.id) {
    await tenantQuery(
      ctx.schemaName,
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
      [body.id, ctx.tenantUserId]
    );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
