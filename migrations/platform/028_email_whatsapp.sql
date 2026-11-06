-- Migration 028: Email and WhatsApp tables (Wave 9 comms)

CREATE TABLE IF NOT EXISTS platform.email_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  config jsonb NOT NULL, -- EmailConfig (secrets encrypted)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  template_id uuid REFERENCES platform.email_templates(id),
  to_addresses text[] NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'sent', -- 'sent','failed','bounced'
  message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- WhatsApp
CREATE TABLE IF NOT EXISTS platform.whatsapp_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  access_token text NOT NULL, -- encrypted
  verify_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  name text NOT NULL, -- Meta template name
  language_code text NOT NULL DEFAULT 'en',
  components jsonb NOT NULL, -- Meta template components
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.whatsapp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  to_phone text NOT NULL,
  template_name text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS email_log_app_id_idx ON platform.email_log(app_id);
CREATE INDEX IF NOT EXISTS email_log_sent_at_idx ON platform.email_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_log_app_id_idx ON platform.whatsapp_log(app_id);
CREATE INDEX IF NOT EXISTS whatsapp_log_sent_at_idx ON platform.whatsapp_log(sent_at DESC);
