/**
 * Notification service — Agent W2
 */

import { nanoid } from 'nanoid';
import type { Pool } from 'pg';
import type { AppNotification } from './types';

function rowToNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    tenantSlug: row.tenant_slug as string,
    recipientUserId: row.recipient_user_id as string,
    type: row.type as AppNotification['type'],
    title: row.title as string,
    body: row.body as string,
    link: row.link as string | undefined,
    appId: row.app_id as string | undefined,
    recordId: row.record_id as string | undefined,
    read: row.read as boolean,
    createdAt: new Date(row.created_at as string),
  };
}

export async function sendNotification(
  notification: Omit<AppNotification, 'id' | 'read' | 'createdAt'>,
  pgPool: Pool,
): Promise<void> {
  const id = nanoid();
  await pgPool.query(
    `INSERT INTO platform.notifications
       (id, tenant_slug, recipient_user_id, type, title, body, link, app_id, record_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      notification.tenantSlug,
      notification.recipientUserId,
      notification.type,
      notification.title,
      notification.body,
      notification.link ?? null,
      notification.appId ?? null,
      notification.recordId ?? null,
    ],
  );
}

export async function getNotifications(
  tenantSlug: string,
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number },
  pgPool: Pool,
): Promise<AppNotification[]> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const params: unknown[] = [tenantSlug, userId, limit, offset];
  let where = 'tenant_slug = $1 AND recipient_user_id = $2';
  if (opts.unreadOnly) {
    where += ' AND read = false';
  }
  const { rows } = await pgPool.query<Record<string, unknown>>(
    `SELECT * FROM platform.notifications
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    params,
  );
  return rows.map(rowToNotification);
}

export async function markRead(
  notificationId: string,
  userId: string,
  pgPool: Pool,
): Promise<void> {
  await pgPool.query(
    `UPDATE platform.notifications
     SET read = true
     WHERE id = $1 AND recipient_user_id = $2`,
    [notificationId, userId],
  );
}

export async function markAllRead(
  tenantSlug: string,
  userId: string,
  pgPool: Pool,
): Promise<void> {
  await pgPool.query(
    `UPDATE platform.notifications
     SET read = true
     WHERE tenant_slug = $1 AND recipient_user_id = $2 AND read = false`,
    [tenantSlug, userId],
  );
}

export async function getUnreadCount(
  tenantSlug: string,
  userId: string,
  pgPool: Pool,
): Promise<number> {
  const { rows } = await pgPool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM platform.notifications
     WHERE tenant_slug = $1 AND recipient_user_id = $2 AND read = false`,
    [tenantSlug, userId],
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}
