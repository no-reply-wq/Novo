-- Wave5 Agent T: Custom Component Definition Registry
CREATE TABLE IF NOT EXISTS platform.custom_component_defs (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  app_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  api_key     TEXT NOT NULL,
  description TEXT,
  version     INTEGER NOT NULL DEFAULT 1,
  code        TEXT NOT NULL,
  props_schema  JSONB NOT NULL DEFAULT '[]'::jsonb,
  preview_props JSONB,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(app_id, api_key)
);
CREATE INDEX IF NOT EXISTS custom_component_defs_app_id_idx
  ON platform.custom_component_defs(app_id);
