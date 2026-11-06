-- migrations/platform/026_access_rules.sql
--
-- Wave 8: Row-level access rules, field permissions, and per-user overrides.
-- These tables live in the platform schema alongside other platform metadata.

BEGIN;

-- ─── Table access rules (row-level) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.table_access_rules (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid        NOT NULL,
  role_id    text        NOT NULL,
  operation  text        NOT NULL
                         CHECK (operation IN ('select','insert','update','delete','all')),
  condition  text        NOT NULL,
  priority   integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (table_id, role_id, operation)
);

CREATE INDEX IF NOT EXISTS idx_table_access_rules_table_id
  ON platform.table_access_rules (table_id);

CREATE INDEX IF NOT EXISTS idx_table_access_rules_role_id
  ON platform.table_access_rules (role_id);

COMMENT ON TABLE platform.table_access_rules IS
  'Row-level access control rules: expressions that determine which records each role can see/modify.';

COMMENT ON COLUMN platform.table_access_rules.condition IS
  'Expression string, e.g. "record.owner_id == user.id" or "record.location_id in user.locations".';

COMMENT ON COLUMN platform.table_access_rules.priority IS
  'Lower value = higher priority when multiple rules match (default 0).';

-- ─── Field permissions (column-level) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.field_permissions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id   uuid        NOT NULL,
  field_id   text        NOT NULL,
  role_id    text        NOT NULL,
  permission text        NOT NULL
                         CHECK (permission IN ('hidden','read_only','editable')),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (table_id, field_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_field_permissions_table_id
  ON platform.field_permissions (table_id);

COMMENT ON TABLE platform.field_permissions IS
  'Column-level permissions: hidden, read-only, or editable per role.';

-- ─── Per-user permission overrides ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.user_permission_overrides (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text        NOT NULL,
  table_id   uuid        NOT NULL,
  overrides  jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, table_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user_id
  ON platform.user_permission_overrides (user_id);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_table_id
  ON platform.user_permission_overrides (table_id);

COMMENT ON TABLE platform.user_permission_overrides IS
  'Per-user overrides on top of role-based access rules. overrides JSONB schema:
   {
     "canCreate": boolean,
     "canEdit": boolean,
     "canDelete": boolean,
     "fieldOverrides": { "<fieldId>": "hidden"|"read_only"|"editable" },
     "rowFilter": "<expression>"
   }';

COMMIT;
