-- Migration 036: platform.workflow_runs — shared run log across all tenants

=======
>>>>>>> 8b4b002 (feat(expr): complete expression engine with new functions, validation, lock-rules, autonumber)
CREATE TABLE IF NOT EXISTS platform.workflow_runs (
  id           TEXT         PRIMARY KEY,
  workflow_id  TEXT         NOT NULL,
  app_id       TEXT         NOT NULL,
  tenant_slug  TEXT         NOT NULL,
  trigger_type TEXT         NOT NULL,
  trigger_data JSONB,
  status       TEXT         NOT NULL DEFAULT 'running'
               CHECK (status IN ('running', 'completed', 'failed', 'timed_out')),
  started_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  duration_ms  INTEGER,
  step_logs    JSONB        NOT NULL DEFAULT '[]'::jsonb,
  error        TEXT,
  user_id      TEXT
);

CREATE INDEX IF NOT EXISTS platform_workflow_runs_app_started_idx
  ON platform.workflow_runs (app_id, started_at DESC);

CREATE INDEX IF NOT EXISTS platform_workflow_runs_wf_started_idx
  ON platform.workflow_runs (workflow_id, started_at DESC);

CREATE INDEX IF NOT EXISTS platform_workflow_runs_status_idx
  ON platform.workflow_runs (status)
  WHERE status = 'running';
=======
>>>>>>> 8b4b002 (feat(expr): complete expression engine with new functions, validation, lock-rules, autonumber)
