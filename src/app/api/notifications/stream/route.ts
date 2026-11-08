/**
 * GET /api/notifications/stream — Server-Sent Events stream for real-time notifications.
 * Polls DB every 10s and sends new notifications since last check.
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { getNotifications } from '@/platform/notifications/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.tenantSlug) {
    return new Response('Unauthorized', { status: 401 });
  }

  const tenantSlug = session.user.tenantSlug;
  const userId = session.user.id;

  const encoder = new TextEncoder();
  let lastCheck = new Date();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial ping
      controller.enqueue(encoder.encode(': ping\n\n'));

      async function poll() {
        if (closed) return;
        try {
          const since = lastCheck;
          lastCheck = new Date();
          const notifications = await getNotifications(
            tenantSlug,
            userId,
            { unreadOnly: true, limit: 20 },
            pgPool,
          );
          // Filter to only those newer than since
          const fresh = notifications.filter(
            (n) => n.createdAt > since,
          );
          if (fresh.length > 0) {
            const data = JSON.stringify(fresh);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } else {
            // keep-alive
            controller.enqueue(encoder.encode(': ping\n\n'));
          }
        } catch {
          // DB error — send keep-alive and continue
          controller.enqueue(encoder.encode(': ping\n\n'));
        }

        if (!closed) {
          setTimeout(poll, 10_000);
        }
      }

      setTimeout(poll, 10_000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
