-- Migration 017: Payment orders table
-- Tracks payment orders across Razorpay and Stripe providers.

CREATE TABLE IF NOT EXISTS platform.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  provider text NOT NULL,
  provider_order_id text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created',
  record_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS payment_orders_tenant_status ON platform.payment_orders(tenant_slug, status);
CREATE INDEX IF NOT EXISTS payment_orders_provider_order_id ON platform.payment_orders(provider_order_id);
