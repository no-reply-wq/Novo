-- Migration 013: Quote / BOM revision versioning table (platform schema).

CREATE TABLE IF NOT EXISTS platform.record_versions (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  table_api_key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  version_label TEXT NOT NULL,
  version_type TEXT NOT NULL DEFAULT 'revision',  -- 'quote_revision', 'bom_revision', etc.
  snapshot JSONB NOT NULL,
  status TEXT,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(record_id, version_number, version_type)
);

CREATE INDEX IF NOT EXISTS record_versions_record_id
  ON platform.record_versions (record_id);

CREATE INDEX IF NOT EXISTS record_versions_app_id
  ON platform.record_versions (app_id, table_api_key);
