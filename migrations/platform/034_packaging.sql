-- Wave 12: App versioning and environments

CREATE TABLE IF NOT EXISTS platform.app_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  version       text NOT NULL,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'preview', 'published', 'archived')),
  bundle        jsonb NOT NULL,
  published_at  timestamptz,
  published_by  text,
  rollback_from uuid REFERENCES platform.app_versions(id),
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_versions_app_id ON platform.app_versions(app_id);
CREATE INDEX IF NOT EXISTS idx_app_versions_status ON platform.app_versions(app_id, status);

CREATE TABLE IF NOT EXISTS platform.app_environments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id             uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  type               text NOT NULL CHECK (type IN ('development', 'staging', 'production')),
  current_version_id uuid REFERENCES platform.app_versions(id),
  slug               text NOT NULL UNIQUE,
  UNIQUE (app_id, type)
);

CREATE INDEX IF NOT EXISTS idx_app_environments_app_id ON platform.app_environments(app_id);
