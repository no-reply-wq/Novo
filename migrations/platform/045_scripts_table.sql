-- Migration 007: tenant script versions table
CREATE TABLE IF NOT EXISTS public.script_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  version INT NOT NULL,
  code TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by TEXT NOT NULL,
  UNIQUE(script_id, version)
);

CREATE INDEX IF NOT EXISTS idx_script_versions_script ON public.script_versions(script_id);
