-- Migration 037: AI usage tracking table
CREATE TABLE IF NOT EXISTS platform.ai_usage (
  id          TEXT        PRIMARY KEY,
  tenant_slug TEXT        NOT NULL,
  app_id      TEXT,
  user_id     TEXT        NOT NULL,
  operation   TEXT        NOT NULL
                CHECK (operation IN ('app_draft','script_draft','field_suggestion')),
  tokens_used INTEGER     NOT NULL DEFAULT 0,
  model       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_tenant_month
  ON platform.ai_usage(tenant_slug, created_at);
