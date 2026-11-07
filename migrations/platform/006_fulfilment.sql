-- Platform-level fulfilment config storage
-- (The runtime fulfilment_links table is in 006_fulfilment_tables.sql)

CREATE TABLE IF NOT EXISTS platform.fulfilment_configs (
  id         TEXT        PRIMARY KEY,
  app_id     TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  config     JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_fulfilment_configs_app
  ON platform.fulfilment_configs(app_id);

CREATE TABLE IF NOT EXISTS platform.fulfilment_links (
  id             TEXT        PRIMARY KEY,
  config_id      TEXT        NOT NULL,
  app_id         TEXT        NOT NULL,
  tenant_slug    TEXT        NOT NULL,
  source_line_id TEXT        NOT NULL,
  target_line_id TEXT        NOT NULL,
  linked_qty     NUMERIC(18,4) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_fulfilment_links_source
  ON platform.fulfilment_links(source_line_id);
CREATE INDEX IF NOT EXISTS idx_platform_fulfilment_links_target
  ON platform.fulfilment_links(target_line_id);
CREATE INDEX IF NOT EXISTS idx_platform_fulfilment_links_app_config
  ON platform.fulfilment_links(app_id, config_id);

CREATE TABLE IF NOT EXISTS platform.convert_to_configs (
  id                 TEXT        PRIMARY KEY,
  app_id             TEXT        NOT NULL,
  name               TEXT        NOT NULL DEFAULT '',
  source_table_id    TEXT        NOT NULL,
  target_table_id    TEXT        NOT NULL,
  header_mappings    JSONB       NOT NULL DEFAULT '[]',
  line_mappings      JSONB       NOT NULL DEFAULT '[]',
  link_back_field    TEXT,
  respect_fulfilment BOOLEAN     NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_convert_to_configs_app
  ON platform.convert_to_configs(app_id);
