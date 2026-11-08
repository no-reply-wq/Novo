-- AI App Generator drafts table
-- Stores AI-generated app drafts before they are applied to create real apps.

CREATE TABLE platform.app_generation_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  user_id text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  draft jsonb NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON platform.app_generation_drafts(tenant_slug, created_at DESC);
