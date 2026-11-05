-- Migration 011: Platform-level integration configs and logs
-- These tables live in the platform schema and are keyed by tenant_slug
-- (not app_id), allowing integrations to be shared across all apps of a tenant.

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.integration_configs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  type        text NOT NULL,
  name        text NOT NULL,
  config      jsonb NOT NULL DEFAULT '{}',  -- encrypted values stored as strings
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_configs_tenant_type
  ON platform.integration_configs(tenant_slug, type);

CREATE TABLE IF NOT EXISTS platform.integration_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug     text NOT NULL,
  integration_id  uuid REFERENCES platform.integration_configs(id) ON DELETE SET NULL,
  type            text NOT NULL,
  status          text NOT NULL CHECK (status IN ('success', 'error')),
  request         jsonb,
  response        jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant_created
  ON platform.integration_logs(tenant_slug, created_at DESC);
