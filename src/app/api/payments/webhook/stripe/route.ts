/**
 * POST /api/payments/webhook/stripe
 * Stripe webhook handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { handleStripeWebhook } from '@/platform/integrations/payments/stripe';

export async function POST(req: NextRequest) {
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature') ?? '';
  const body = await req.text();

  let event: Awaited<ReturnType<typeof handleStripeWebhook>>;
  try {
    event = await handleStripeWebhook(body, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const dataObject = event.data.object as Record<string, unknown>;

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntentId = dataObject['id'] as string | undefined;
    if (paymentIntentId) {
      await pgPool.query(
        `UPDATE platform.payment_orders
         SET status = 'paid', paid_at = now()
         WHERE provider_order_id = $1`,
        [paymentIntentId]
      );

      // Fire workflow trigger payment_received
      await pgPool.query<{ tenant_slug: string }>(
        `SELECT tenant_slug FROM platform.payment_orders WHERE provider_order_id = $1`,
        [paymentIntentId]
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
                provider: 'stripe',
                paymentIntentId,
                amount: dataObject['amount'],
                currency: dataObject['currency'],
                status: 'succeeded',
              }),
            ]
          ).catch(() => {
            // workflow_events table may not exist in all deployments; non-fatal
          });
        }
      });
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const paymentIntentId = dataObject['id'] as string | undefined;
    if (paymentIntentId) {
      await pgPool.query(
        `UPDATE platform.payment_orders
         SET status = 'failed'
         WHERE provider_order_id = $1`,
        [paymentIntentId]
      );
    }
  } else if (event.type === 'charge.refunded') {
    const paymentIntentId = dataObject['payment_intent'] as string | undefined;
    if (paymentIntentId) {
      await pgPool.query(
        `UPDATE platform.payment_orders
         SET status = 'refunded'
         WHERE provider_order_id = $1`,
        [paymentIntentId]
      );
    }
  }

  return NextResponse.json({ received: true });
}
