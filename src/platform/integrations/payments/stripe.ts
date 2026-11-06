/**
 * Stripe payment integration.
 */

import crypto from 'crypto';
import { NotConfiguredError } from '../secrets/manager';
import type { StripeWebhookEvent } from './types';

const STRIPE_API = 'https://api.stripe.com/v1';

interface StripePaymentIntentResponse {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
}

function getSecretKey(tenantSlug: string): string {
  const key = process.env[`STRIPE_SECRET_KEY_${tenantSlug.toUpperCase()}`] ?? process.env['STRIPE_SECRET_KEY'];
  if (!key) {
    throw new NotConfiguredError(
      `Stripe secret key not configured for tenant "${tenantSlug}". ` +
      'Set STRIPE_SECRET_KEY environment variable.'
    );
  }
  return key;
}

function encodeFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Create a Stripe PaymentIntent.
 * amount must be in smallest currency unit (cents for USD).
 */
export async function createStripePaymentIntent(params: {
  tenantSlug: string;
  amount: number;
  currency?: string;
  metadata?: Record<string, string>;
}): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const { tenantSlug, amount, currency = 'usd', metadata } = params;
  const secretKey = getSecretKey(tenantSlug);

  const bodyParams: Record<string, string> = {
    amount: String(amount),
    currency,
  };

  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      bodyParams[`metadata[${k}]`] = v;
    }
  }

  const res = await fetch(`${STRIPE_API}/payment_intents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeFormBody(bodyParams),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe PaymentIntent creation failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as StripePaymentIntentResponse;

  return {
    clientSecret: data.client_secret,
    paymentIntentId: data.id,
  };
}

/**
 * Handle Stripe webhook event.
 * Stripe signature format: "t=timestamp,v1=signature"
 */
export async function handleStripeWebhook(
  body: string,
  signature: string,
  webhookSecret: string
): Promise<StripeWebhookEvent> {
  // Parse "t=timestamp,v1=sig1[,v1=sig2]" header
  const parts = signature.split(',');
  let timestamp: string | undefined;
  const v1Signatures: string[] = [];

  for (const part of parts) {
    const [key, val] = part.split('=');
    if (key === 't') timestamp = val;
    else if (key === 'v1') v1Signatures.push(val ?? '');
  }

  if (!timestamp || v1Signatures.length === 0) {
    throw new Error('Invalid Stripe webhook signature header format');
  }

  // Compute expected signature: HMAC-SHA256("timestamp.body")
  const signedPayload = `${timestamp}.${body}`;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');

  const isValid = v1Signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(sig, 'hex')
      );
    } catch {
      return false;
    }
  });

  if (!isValid) {
    throw new Error('Stripe webhook signature verification failed');
  }

  return JSON.parse(body) as StripeWebhookEvent;
}
