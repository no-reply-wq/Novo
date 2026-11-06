-- Migration 034: App packaging — versioned bundles and environments
-- Draft → Preview → Publish lifecycle + dev/staging/production environments

-- ─── App versions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.app_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id         uuid        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  version        text        NOT NULL,
  status         text        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','preview','published','archived')),
  bundle         jsonb       NOT NULL,
  published_at   timestamptz,
  published_by   text,
  rollback_from  uuid        REFERENCES platform.app_versions(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_versions_app_status
  ON platform.app_versions(app_id, status);

CREATE INDEX IF NOT EXISTS idx_app_versions_app_created
  ON platform.app_versions(app_id, created_at DESC);

COMMENT ON TABLE platform.app_versions IS
  'Versioned snapshots of app bundles (tables, pages, workflows, scripts, integrations). '
  'Status lifecycle: draft → preview → published → archived.';

-- ─── App environments ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.app_environments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id             uuid        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  type               text        NOT NULL
                                 CHECK (type IN ('development','staging','production')),
  current_version_id uuid        REFERENCES platform.app_versions(id),
  slug               text        NOT NULL UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, type)
);

CREATE INDEX IF NOT EXISTS idx_app_environments_app
  ON platform.app_environments(app_id);

COMMENT ON TABLE platform.app_environments IS
  'Per-app environment pointers (dev / staging / production). '
  'Each environment points to the currently active version for that env.';

COMMENT ON COLUMN platform.app_environments.slug IS
  'Unique slug used in the URL for this environment, e.g. myapp-dev, myapp-staging, myapp';
