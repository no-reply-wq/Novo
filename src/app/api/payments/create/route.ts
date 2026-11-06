/**
 * POST /api/payments/create
 * Create a payment order (Razorpay) or PaymentIntent (Stripe).
 * Body: { provider, amount, currency?, recordId?, metadata? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { createRazorpayOrder } from '@/platform/integrations/payments/razorpay';
import { createStripePaymentIntent } from '@/platform/integrations/payments/stripe';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';

const CreatePaymentSchema = z.object({
  tenantSlug: z.string().min(1),
  provider: z.enum(['razorpay', 'stripe']),
  amount: z.number().int().positive(),
  currency: z.string().min(1).max(3).optional(),
  recordId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreatePaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  const { tenantSlug, provider, amount, currency, recordId, metadata } = parsed.data;

  try {
    let providerOrderId: string;
    let clientSecret: string | undefined;
    const resolvedCurrency = currency ?? (provider === 'razorpay' ? 'INR' : 'usd');

    if (provider === 'razorpay') {
      const result = await createRazorpayOrder({
        tenantSlug,
        amount,
        currency: resolvedCurrency,
        notes: { tenantSlug },
      });
      providerOrderId = result.orderId;
    } else {
      const result = await createStripePaymentIntent({
        tenantSlug,
        amount,
        currency: resolvedCurrency,
        metadata: { tenantSlug, ...(recordId ? { recordId } : {}) },
      });
      providerOrderId = result.paymentIntentId;
      clientSecret = result.clientSecret;
    }

    // Store in platform.payment_orders
    const insertRes = await pgPool.query<{ id: string }>(
      `INSERT INTO platform.payment_orders
         (tenant_slug, provider, provider_order_id, amount, currency, status, record_id, metadata)
       VALUES ($1, $2, $3, $4, $5, 'created', $6, $7)
       RETURNING id`,
      [
        tenantSlug,
        provider,
        providerOrderId,
        amount,
        resolvedCurrency,
        recordId ?? null,
        JSON.stringify(metadata),
      ]
    );

    const orderId = insertRes.rows[0].id;

    return NextResponse.json({
      orderId,
      providerOrderId,
      ...(clientSecret ? { clientSecret } : {}),
    });
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('[payments/create]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
