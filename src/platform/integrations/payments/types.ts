/**
 * Payment integration types for Razorpay and Stripe.
 */

export interface PaymentConfig {
  provider: 'razorpay' | 'stripe';
  keyId: string;         // encrypted
  keySecret: string;     // encrypted
  webhookSecret: string; // encrypted
  currency: string;      // 'INR' | 'USD' etc.
}

export interface PaymentOrder {
  id: string;             // platform order id
  providerOrderId: string;
  amount: number;         // in smallest unit (paise/cents)
  currency: string;
  status: 'created' | 'paid' | 'failed' | 'refunded';
  tenantSlug: string;
  recordId?: string;      // which record this payment is for
  metadata: Record<string, unknown>;
  createdAt: string;
  paidAt?: string;
}

export interface PaymentLink {
  url: string;
  orderId: string;
  expiresAt?: string;
}

// ─── Razorpay webhook event ───────────────────────────────────────────────────

export interface RazorpayWebhookEvent {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        notes?: Record<string, string>;
      };
    };
    order?: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        receipt?: string;
        notes?: Record<string, string>;
      };
    };
  };
}

// ─── Stripe webhook event ─────────────────────────────────────────────────────

export interface StripeWebhookEvent {
  id: string;
  object: 'event';
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
}
