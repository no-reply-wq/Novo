-- Spec 3.3: Approval chains v2 (platform schema, with chain definitions)
-- Extends the existing public.approval_requests with platform-schema tables

CREATE TABLE IF NOT EXISTS platform.approval_chains (
  id            TEXT PRIMARY KEY,
  app_id        TEXT NOT NULL,
  name          TEXT NOT NULL,
  table_api_key TEXT NOT NULL,
  trigger_expr  TEXT,
  levels        JSONB NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.approval_requests (
  id            TEXT PRIMARY KEY,
  chain_id      TEXT NOT NULL REFERENCES platform.approval_chains(id),
  app_id        TEXT NOT NULL,
  tenant_slug   TEXT NOT NULL,
  table_api_key TEXT NOT NULL,
  record_id     TEXT NOT NULL,
  current_level INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_app_status
  ON platform.approval_requests(app_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_table_record
  ON platform.approval_requests(table_api_key, record_id);

CREATE TABLE IF NOT EXISTS platform.approval_actions (
  id           TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL REFERENCES platform.approval_requests(id),
  level        INTEGER NOT NULL,
  approver_id  TEXT NOT NULL,
  decision     TEXT NOT NULL,
  comment      TEXT,
  delegated_to TEXT,
  decided_at   TIMESTAMPTZ DEFAULT now()
);
