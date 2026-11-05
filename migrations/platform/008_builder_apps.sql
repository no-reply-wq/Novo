-- Migration 008: Builder apps table
-- Apps created by platform builders live in the public schema,
-- scoped to a tenant by tenant_slug.

CREATE TABLE IF NOT EXISTS public.apps (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug  TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  description  TEXT,
  icon         TEXT,
  color        TEXT,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apps_tenant_slug ON public.apps (tenant_slug);
