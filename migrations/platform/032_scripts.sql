-- Migration 032: tenant scripts sandbox, run log, and secrets
-- Requires: platform.apps table (from 008_builder_apps.sql)

CREATE TABLE IF NOT EXISTS platform.tenant_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  code text NOT NULL,
  input_schema jsonb NOT NULL DEFAULT '[]',
  output_schema jsonb NOT NULL DEFAULT '[]',
  timeout_ms integer NOT NULL DEFAULT 2000,
  memory_limit_mb integer NOT NULL DEFAULT 32,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  test_cases jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.script_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES platform.tenant_scripts(id),
  tenant_slug text NOT NULL,
  input jsonb NOT NULL,
  output jsonb,
  duration_ms integer,
  memory_bytes bigint,
  error text,
  logs text[],
  ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_script_run_log_script_ran
  ON platform.script_run_log(script_id, ran_at DESC);

CREATE TABLE IF NOT EXISTS platform.tenant_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  key text NOT NULL,
  ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(app_id, key)
);

-- Auto-update updated_at on tenant_scripts
CREATE OR REPLACE FUNCTION platform.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_scripts_updated_at ON platform.tenant_scripts;
CREATE TRIGGER trg_tenant_scripts_updated_at
  BEFORE UPDATE ON platform.tenant_scripts
  FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
