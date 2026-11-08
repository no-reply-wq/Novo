-- Migration 014: Customer portal configuration table.

CREATE TABLE IF NOT EXISTS platform.portal_configs (
  app_id TEXT PRIMARY KEY,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN DEFAULT false
);
