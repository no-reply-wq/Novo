#!/bin/bash
set -e
cd "$(dirname "$0")"
PSQL="/opt/homebrew/opt/postgresql@16/bin/psql"
DB="novo"

echo "=== Creating missing public.apps table ==="
$PSQL -d $DB << 'SQL'
CREATE TABLE IF NOT EXISTS public.apps (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
SELECT 'public.apps ready' as status;
SQL

echo "=== Done ==="
