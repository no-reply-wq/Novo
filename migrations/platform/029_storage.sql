-- Migration 029: S3/R2 storage configuration and file upload tracking
-- Wave 9 — Storage & Import

CREATE TABLE IF NOT EXISTS platform.storage_configs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  config     jsonb       NOT NULL, -- StorageConfig (secrets encrypted)
  is_default boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only one default config per app
CREATE UNIQUE INDEX IF NOT EXISTS storage_configs_app_default ON platform.storage_configs(app_id) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS platform.file_uploads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug   text        NOT NULL,
  table_id      uuid,
  record_id     text,
  field_id      text,
  storage_key   text        NOT NULL,
  original_name text        NOT NULL,
  content_type  text        NOT NULL,
  size_bytes    bigint      NOT NULL,
  uploaded_by   text        NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_uploads_tenant_record ON platform.file_uploads(tenant_slug, record_id);
CREATE INDEX IF NOT EXISTS file_uploads_tenant_table ON platform.file_uploads(tenant_slug, table_id);
CREATE INDEX IF NOT EXISTS file_uploads_key ON platform.file_uploads(storage_key);
