-- Migration: 002_locations
-- Access control tables: locations, user_locations, access_policies, field_permissions, user_overrides

CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL,
  parent_id UUID REFERENCES public.locations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id UUID NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, location_id)
);

CREATE TABLE IF NOT EXISTS public.access_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  condition TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.field_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  access TEXT NOT NULL CHECK (access IN ('hidden','read','write')),
  condition_expr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  table_id TEXT NOT NULL,
  override_type TEXT NOT NULL CHECK (override_type IN ('grant','revoke')),
  operation TEXT NOT NULL,
  condition TEXT,
  expires_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
