-- Approval engine tables (platform-level, public schema)

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  current_level INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','escalated','delegated')),
  amount_value NUMERIC,
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  comments TEXT,
  delegated_to TEXT
);

CREATE TABLE IF NOT EXISTS public.approval_level_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  level INT NOT NULL,
  approver_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve','reject','delegate')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  comments TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant ON public.approval_requests(tenant_slug, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_record ON public.approval_requests(table_id, record_id);
