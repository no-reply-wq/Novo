-- Migration 025: Workflow v2 — approval flows, approval requests, decisions, and schedule triggers
-- Adds the platform-level tables required by the multi-level approval engine and schedule triggers.

-- ─── Approval flows ───────────────────────────────────────────────────────────

CREATE TABLE platform.approval_flows (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  config     jsonb       NOT NULL,  -- ApprovalFlow JSON (levels, parallelOrSequential)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX approval_flows_app_id_idx ON platform.approval_flows (app_id);

-- ─── Approval requests (in-flight) ───────────────────────────────────────────

CREATE TABLE platform.approval_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id          uuid        NOT NULL REFERENCES platform.approval_flows(id) ON DELETE RESTRICT,
  workflow_run_id  text        NOT NULL,
  record_id        text        NOT NULL,
  table_id         uuid        NOT NULL,
  current_level    integer     NOT NULL DEFAULT 1,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected', 'timed_out')),
  config_snapshot  jsonb       NOT NULL,  -- snapshot of ApprovalFlow at request time
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  timeout_at       timestamptz
);

CREATE INDEX approval_requests_flow_id_idx         ON platform.approval_requests (flow_id);
CREATE INDEX approval_requests_status_timeout_idx  ON platform.approval_requests (status, timeout_at)
  WHERE status = 'pending' AND timeout_at IS NOT NULL;
CREATE INDEX approval_requests_workflow_run_idx    ON platform.approval_requests (workflow_run_id);

-- ─── Approval decisions ───────────────────────────────────────────────────────

CREATE TABLE platform.approval_decisions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid        NOT NULL REFERENCES platform.approval_requests(id) ON DELETE CASCADE,
  level       integer     NOT NULL,
  approver_id text        NOT NULL,
  decision    text        NOT NULL CHECK (decision IN ('approved', 'rejected')),
  comment     text,
  decided_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX approval_decisions_request_level_idx ON platform.approval_decisions (request_id, level);

-- ─── Workflow schedule triggers ───────────────────────────────────────────────

CREATE TABLE platform.workflow_schedules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  workflow_id     uuid        NOT NULL,
  cron_expression text        NOT NULL,
  timezone        text        NOT NULL DEFAULT 'UTC',
  is_active       boolean     NOT NULL DEFAULT true,
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workflow_schedules_app_id_idx    ON platform.workflow_schedules (app_id);
CREATE INDEX workflow_schedules_active_idx    ON platform.workflow_schedules (is_active, next_run_at)
  WHERE is_active = true;

-- ─── Workflow resumption tokens ───────────────────────────────────────────────

CREATE TABLE platform.workflow_resumption_tokens (
  run_id              text        PRIMARY KEY,
  workflow_id         uuid        NOT NULL,
  step_id             text        NOT NULL,
  approval_request_id uuid        REFERENCES platform.approval_requests(id) ON DELETE SET NULL,
  context_snapshot    jsonb       NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz
);

CREATE INDEX workflow_resumption_expires_idx ON platform.workflow_resumption_tokens (expires_at)
  WHERE expires_at IS NOT NULL;

-- ─── updated_at auto-update ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION platform.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'approval_flows_updated_at'
  ) THEN
    CREATE TRIGGER approval_flows_updated_at
      BEFORE UPDATE ON platform.approval_flows
      FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'workflow_schedules_updated_at'
  ) THEN
    CREATE TRIGGER workflow_schedules_updated_at
      BEFORE UPDATE ON platform.workflow_schedules
      FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
  END IF;
END;
$$;
