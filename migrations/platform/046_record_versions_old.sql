-- Migration 010: Record version snapshots table.
--
-- Stores full JSON snapshots of records at a point in time.
-- Used by src/platform/data/versions.ts.

CREATE TABLE IF NOT EXISTS public.record_versions (
  id             BIGSERIAL    PRIMARY KEY,
  tenant_schema  TEXT         NOT NULL,
  table_name     TEXT         NOT NULL,
  record_id      UUID         NOT NULL,
  version_number INTEGER      NOT NULL,
  version_label  TEXT,                       -- e.g. "R1", "Before approval", NULL = auto
  data           JSONB        NOT NULL,       -- full record snapshot
  saved_by       UUID,                        -- user who triggered the version save
  saved_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT record_versions_unique_ver
    UNIQUE (tenant_schema, table_name, record_id, version_number)
);

-- Lookup by record (most common query)
CREATE INDEX IF NOT EXISTS record_versions_record
  ON public.record_versions (tenant_schema, table_name, record_id);

-- Lookup by time (for auditing / time-travel)
CREATE INDEX IF NOT EXISTS record_versions_saved_at
  ON public.record_versions (saved_at);
