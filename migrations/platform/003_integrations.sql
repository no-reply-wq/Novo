-- Platform integrations tables
-- Migration: 003_integrations
-- Created by Agent E (wave1/agent-e)

CREATE TABLE IF NOT EXISTS public.platform_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL,
  name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(app_id, name)
);

CREATE INDEX IF NOT EXISTS idx_platform_secrets_app_id ON public.platform_secrets(app_id);

CREATE TABLE IF NOT EXISTS public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID,
  connector_id UUID,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_app_id ON public.email_log(app_id);
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON public.email_log(created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID,
  connector_id UUID,
  to_number TEXT NOT NULL,
  template_name TEXT,
  message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  status TEXT NOT NULL DEFAULT 'sent',
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_app_id ON public.whatsapp_log(app_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_to_number ON public.whatsapp_log(to_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_created_at ON public.whatsapp_log(created_at DESC);

-- ConnectorDef registry (referenced by all integration modules)
CREATE TABLE IF NOT EXISTS public.connector_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_defs_app_id ON public.connector_defs(app_id);
