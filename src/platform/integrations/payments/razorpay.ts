/**
 * Razorpay payment integration.
 */

import crypto from 'crypto';
import { NotConfiguredError } from '../secrets/manager';
import type { RazorpayWebhookEvent } from './types';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string;
}

function getCredentials(tenantSlug: string): { keyId: string; keySecret: string; webhookSecret: string } {
  const keyId = process.env[`RAZORPAY_KEY_ID_${tenantSlug.toUpperCase()}`] ?? process.env['RAZORPAY_KEY_ID'];
  const keySecret = process.env[`RAZORPAY_KEY_SECRET_${tenantSlug.toUpperCase()}`] ?? process.env['RAZORPAY_KEY_SECRET'];
  const webhookSecret = process.env[`RAZORPAY_WEBHOOK_SECRET_${tenantSlug.toUpperCase()}`] ?? process.env['RAZORPAY_WEBHOOK_SECRET'];

  if (!keyId || !keySecret || !webhookSecret) {
    throw new NotConfiguredError(
      `Razorpay credentials not configured for tenant "${tenantSlug}". ` +
      'Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET environment variables.'
    );
  }

  return { keyId, keySecret, webhookSecret };
}

/**
 * Create a Razorpay order.
 * amount must be in paise (₹1 = 100 paise).
 */
export async function createRazorpayOrder(params: {
  tenantSlug: string;
  amount: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}): Promise<{ orderId: string; amount: number; currency: string }> {
  const { tenantSlug, amount, currency = 'INR', receipt, notes } = params;
  const { keyId, keySecret } = getCredentials(tenantSlug);

  const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const body: Record<string, unknown> = { amount, currency };
  if (receipt) body['receipt'] = receipt;
  if (notes) body['notes'] = notes;

  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay order creation failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as RazorpayOrderResponse;

  return {
    orderId: data.id,
    amount: data.amount,
    currency: data.currency,
  };
}

/**
 * Verify Razorpay payment signature after client-side payment.
 * HMAC-SHA256 of "orderId|paymentId" using keySecret.
 */
export async function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): Promise<boolean> {
  const { orderId, paymentId, signature, keySecret } = params;
  const payload = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(payload)
    .digest('hex');

  try {
    const expBuf = Buffer.from(expected, 'hex');
    const sigBuf = Buffer.from(signature, 'hex');
    if (expBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expBuf, sigBuf);
  } catch {
    return false;
  }
}

/**
 * Handle Razorpay webhook event.
 * Verifies HMAC-SHA256 signature and returns parsed event.
 */
export async function handleRazorpayWebhook(
  body: string,
  signature: string,
  webhookSecret: string
): Promise<RazorpayWebhookEvent> {
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  let isValid = false;
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length === expBuf.length) {
      isValid = crypto.timingSafeEqual(expBuf, sigBuf);
    }
  } catch {
    // malformed hex or mismatched lengths → isValid stays false
  }

  if (!isValid) {
    throw new Error('Razorpay webhook signature verification failed');
  }

  return JSON.parse(body) as RazorpayWebhookEvent;
}
