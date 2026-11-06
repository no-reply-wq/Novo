-- Bank reconciliation tables

CREATE TABLE platform.bankrecon_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  app_id uuid NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug, app_id)
);

CREATE TABLE platform.bankrecon_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  bank_name text,
  statement_period jsonb,
  total_transactions integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  unmatched_count integer NOT NULL DEFAULT 0,
  matches jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending',  -- pending|completed
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON platform.bankrecon_sessions(tenant_slug, created_at DESC);
