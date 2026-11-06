/**
 * POST /api/payments/webhook/razorpay
 * Razorpay webhook handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { handleRazorpayWebhook } from '@/platform/integrations/payments/razorpay';

export async function POST(req: NextRequest) {
  const webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
  }

  const signature = req.headers.get('x-razorpay-signature') ?? '';
  const body = await req.text();

  let event: Awaited<ReturnType<typeof handleRazorpayWebhook>>;
  try {
    event = await handleRazorpayWebhook(body, signature, webhookSecret);
  } catch (err) {
    console.error('[razorpay-webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle payment events
  if (event.event === 'payment.captured' || event.event === 'payment.authorized') {
    const payment = event.payload.payment?.entity;
    if (payment) {
      await pgPool.query(
        `UPDATE platform.payment_orders
         SET status = 'paid', paid_at = now()
         WHERE provider_order_id = $1`,
        [payment.order_id]
      );

      // Fire workflow trigger payment_received
      await pgPool.query<{ tenant_slug: string }>(
        `SELECT tenant_slug FROM platform.payment_orders WHERE provider_order_id = $1`,
        [payment.order_id]
      ).then(async (res) => {
        const tenantSlug = res.rows[0]?.tenant_slug;
        if (tenantSlug) {
          await pgPool.query(
            `INSERT INTO platform.workflow_events (tenant_slug, event_type, payload, created_at)
             VALUES ($1, 'payment_received', $2, now())
             ON CONFLICT DO NOTHING`,
            [
              tenantSlug,
              JSON.stringify({
                provider: 'razorpay',
                paymentId: payment.id,
                orderId: payment.order_id,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
              }),
            ]
          ).catch(() => {
            // workflow_events table may not exist in all deployments; non-fatal
          });
        }
      });
    }
  } else if (event.event === 'payment.failed') {
    const payment = event.payload.payment?.entity;
    if (payment) {
      await pgPool.query(
        `UPDATE platform.payment_orders
         SET status = 'failed'
         WHERE provider_order_id = $1`,
        [payment.order_id]
      );
    }
  }

  return NextResponse.json({ received: true });
}
