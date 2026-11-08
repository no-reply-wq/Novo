CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','failure','timeout','loop_error')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_ms INT,
  error TEXT,
  run_log JSONB NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS public.workflow_run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INT,
  output JSONB,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant ON public.workflow_runs(tenant_slug);
CREATE INDEX IF NOT EXISTS idx_workflow_run_logs_run ON public.workflow_run_logs(run_id);
