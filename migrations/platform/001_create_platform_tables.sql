-- Platform infrastructure tables in the public schema.
-- Idempotent: safe to run multiple times.

-- Auto-number sequences table
CREATE TABLE IF NOT EXISTS public.sequences (
  id            BIGSERIAL PRIMARY KEY,
  app_id        TEXT        NOT NULL,
  sequence_id   TEXT        NOT NULL,
  counter       BIGINT      NOT NULL DEFAULT 0,
  reset_rule    TEXT        NOT NULL DEFAULT 'never',  -- 'never' | 'yearly' | 'monthly'
  reset_key     TEXT        NOT NULL DEFAULT '',       -- e.g. '2026' or '2026-11'
  CONSTRAINT sequences_unique UNIQUE (app_id, sequence_id)
);

-- Field-level diff audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id            BIGSERIAL   PRIMARY KEY,
  tenant_schema TEXT        NOT NULL,
  table_name    TEXT        NOT NULL,
  record_id     UUID        NOT NULL,
  user_id       UUID,
  action        TEXT        NOT NULL,  -- 'INSERT' | 'UPDATE' | 'DELETE'
  diff          JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_record
  ON public.audit_log (tenant_schema, table_name, record_id);

CREATE INDEX IF NOT EXISTS audit_log_created
  ON public.audit_log (created_at);
