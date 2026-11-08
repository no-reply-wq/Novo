/**
 * Tests for notification service — Agent W2
 */

import {
  sendNotification,
  getNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
} from '@/platform/notifications/service';
import type { AppNotification } from '@/platform/notifications/types';

// Minimal mock Pool
function makeMockPool(overrides: { query?: jest.Mock } = {}) {
  return {
    query: overrides.query ?? jest.fn().mockResolvedValue({ rows: [] }),
  } as unknown as import('pg').Pool;
}

describe('sendNotification', () => {
  it('inserts a row with the correct params', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] });
    const pool = makeMockPool({ query: queryMock });

    await sendNotification(
      {
        tenantSlug: 'acme',
        recipientUserId: 'user-1',
        type: 'approval_requested',
        title: 'Approval needed',
        body: 'Please review',
        link: '/app/approvals/123',
        appId: 'app-1',
        recordId: 'rec-1',
      },
      pool,
    );

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO platform.notifications/);
    expect(params[1]).toBe('acme');
    expect(params[2]).toBe('user-1');
    expect(params[3]).toBe('approval_requested');
    expect(params[4]).toBe('Approval needed');
    expect(params[5]).toBe('Please review');
    expect(params[6]).toBe('/app/approvals/123');
    expect(params[7]).toBe('app-1');
    expect(params[8]).toBe('rec-1');
  });

  it('uses null for optional fields when not provided', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] });
    const pool = makeMockPool({ query: queryMock });

    await sendNotification(
      {
        tenantSlug: 'acme',
        recipientUserId: 'user-2',
        type: 'custom',
        title: 'Hello',
        body: 'World',
      },
      pool,
    );

    const [, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull();
    expect(params[8]).toBeNull();
  });
});

describe('getNotifications', () => {
  const mockRow = {
    id: 'n1',
    tenant_slug: 'acme',
    recipient_user_id: 'user-1',
    type: 'mention',
    title: 'You were mentioned',
    body: 'In a comment',
    link: null,
    app_id: null,
    record_id: null,
    read: false,
    created_at: new Date().toISOString(),
  };

  it('queries with correct where clause for all notifications', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [mockRow] });
    const pool = makeMockPool({ query: queryMock });

    const results = await getNotifications('acme', 'user-1', {}, pool);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('mention');
    expect(results[0].read).toBe(false);

    const [sql] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/read = false/);
  });

  it('filters unread when unreadOnly is true', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] });
    const pool = makeMockPool({ query: queryMock });

    await getNotifications('acme', 'user-1', { unreadOnly: true }, pool);
    const [sql] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/read = false/);
  });
});

describe('markRead', () => {
  it('updates the correct notification', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] });
    const pool = makeMockPool({ query: queryMock });

    await markRead('notif-1', 'user-1', pool);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE platform.notifications/);
    expect(sql).toMatch(/read = true/);
    expect(params[0]).toBe('notif-1');
    expect(params[1]).toBe('user-1');
  });
});

describe('markAllRead', () => {
  it('updates all unread notifications for the user', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [] });
    const pool = makeMockPool({ query: queryMock });

    await markAllRead('acme', 'user-1', pool);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE platform.notifications/);
    expect(sql).toMatch(/read = true/);
    expect(params[0]).toBe('acme');
    expect(params[1]).toBe('user-1');
  });
});

describe('getUnreadCount', () => {
  it('returns parsed integer count', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [{ count: '7' }] });
    const pool = makeMockPool({ query: queryMock });

    const count = await getUnreadCount('acme', 'user-1', pool);
    expect(count).toBe(7);
  });

  it('returns 0 when no rows', async () => {
    const queryMock = jest.fn().mockResolvedValue({ rows: [{ count: '0' }] });
    const pool = makeMockPool({ query: queryMock });

    const count = await getUnreadCount('acme', 'user-1', pool);
    expect(count).toBe(0);
  });
});
