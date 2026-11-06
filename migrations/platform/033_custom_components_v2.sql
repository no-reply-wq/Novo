-- Wave 11: app-scoped custom components and REST connectors

CREATE TABLE IF NOT EXISTS platform.custom_components_v2 (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id       uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text,
  source_code  text        NOT NULL,
  compiled_code text,
  props_schema  jsonb      NOT NULL DEFAULT '[]',
  events_schema jsonb      NOT NULL DEFAULT '[]',
  version      integer     NOT NULL DEFAULT 1,
  storage_key  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_components_v2_app_id_idx ON platform.custom_components_v2(app_id);

CREATE TABLE IF NOT EXISTS platform.rest_connectors (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  base_url   text        NOT NULL,
  config     jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rest_connectors_app_id_idx ON platform.rest_connectors(app_id);
