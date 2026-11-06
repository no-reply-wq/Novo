/**
 * POST /api/payments/verify
 * Verify Razorpay payment signature after client-side payment.
 * Body: { orderId, paymentId, signature, tenantSlug }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { verifyRazorpaySignature } from '@/platform/integrations/payments/razorpay';

const VerifySchema = z.object({
  tenantSlug: z.string().min(1),
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
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

  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  const { tenantSlug, orderId, paymentId, signature } = parsed.data;

  const keySecret = process.env[`RAZORPAY_KEY_SECRET_${tenantSlug.toUpperCase()}`] ?? process.env['RAZORPAY_KEY_SECRET'];
  if (!keySecret) {
    return NextResponse.json({ error: 'Razorpay not configured for this tenant' }, { status: 503 });
  }

  const valid = await verifyRazorpaySignature({ orderId, paymentId, signature, keySecret });

  if (!valid) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
  }

  // Update order status to paid
  await pgPool.query(
    `UPDATE platform.payment_orders
     SET status = 'paid', paid_at = now()
     WHERE provider_order_id = $1 AND tenant_slug = $2`,
    [orderId, tenantSlug]
  );

  return NextResponse.json({ verified: true });
}
