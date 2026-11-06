-- Migration 035: App member invitations
-- Stores pending email invites for a builder app, scoped to the app.
-- Invites are accepted via a signed token link; on acceptance the user is
-- created (or found) in the tenant schema and assigned the given role.

CREATE TABLE IF NOT EXISTS public.invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role_id     TEXT        NOT NULL,  -- references tenant_*.roles.id
  token       TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  TEXT        NOT NULL,  -- tenant user id
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_app_id ON public.invitations (app_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token  ON public.invitations (token);
CREATE INDEX IF NOT EXISTS idx_invitations_email  ON public.invitations (app_id, email);
