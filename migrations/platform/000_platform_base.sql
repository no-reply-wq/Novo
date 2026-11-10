-- 000_platform_base.sql
-- Base platform schema and tables. Runs before all other platform migrations
-- (alphabetical order). Idempotent: safe to re-run.

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text,
  name text,
  slug text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  name text,
  created_at timestamptz DEFAULT now()
);

-- Add trial_ends_at to public.tenants, but only if that table exists yet
-- (it may be created by a later migration on a fresh database).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenants'
  ) THEN
    ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
  END IF;
END
$$;
