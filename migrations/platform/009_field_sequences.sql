-- Migration 009: Add soft-delete columns to tenant table migration template.
--
-- These columns are added to tables that have soft_delete enabled in their
-- TableDef. The Agent A schema publisher checks SoftDeleteConfig.enabled
-- and applies these columns via ALTER TABLE.
--
-- This migration also documents the standard column names used by
-- src/platform/data/softdelete.ts.

-- Ensure the sequences table exists (idempotent, also in 001)
CREATE TABLE IF NOT EXISTS public.sequences (
  id            BIGSERIAL PRIMARY KEY,
  app_id        TEXT        NOT NULL,
  sequence_id   TEXT        NOT NULL,
  counter       BIGINT      NOT NULL DEFAULT 0,
  reset_rule    TEXT        NOT NULL DEFAULT 'never',
  reset_key     TEXT        NOT NULL DEFAULT '',
  CONSTRAINT sequences_unique UNIQUE (app_id, sequence_id)
);

-- Soft-delete column definitions used by the schema publisher when
-- SoftDeleteConfig.enabled = true. The schema publisher runs:
--
--   ALTER TABLE <tenant_schema>.<table>
--     ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
--     ADD COLUMN IF NOT EXISTS deleted_by    UUID REFERENCES auth.users(id),
--     ADD COLUMN IF NOT EXISTS delete_reason TEXT;
--
-- Index pattern (created per-table by publisher):
--   CREATE INDEX IF NOT EXISTS <table>_deleted_at
--     ON <schema>.<table> (deleted_at)
--     WHERE deleted_at IS NOT NULL;
--
-- No actual DDL here because soft-delete columns are tenant-schema-specific.
-- This file exists to record the standard and satisfy the migration numbering.

-- (intentionally no-op for the platform/public schema)
