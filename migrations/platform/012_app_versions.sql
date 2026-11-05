-- Migration 012: App version snapshots
-- Stores point-in-time snapshots of app configs for version history and rollback.

CREATE TABLE IF NOT EXISTS platform.app_versions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text        NOT NULL,
  app_id      uuid        NOT NULL,
  label       text        NOT NULL,
  snapshot    jsonb       NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_versions_tenant_app_time
  ON platform.app_versions(tenant_slug, app_id, created_at DESC);
