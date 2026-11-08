CREATE TABLE IF NOT EXISTS platform.analytics_drilldown_configs (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_configs_app_idx ON platform.analytics_drilldown_configs(app_id);
