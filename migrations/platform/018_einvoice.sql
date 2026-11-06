-- E-Invoice (IRP) integration tables
-- Stores per-table config + field mappings, and tracks IRN generation per record.

CREATE TABLE platform.einvoice_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  app_id uuid NOT NULL,
  table_id uuid NOT NULL,          -- which invoice table
  config jsonb NOT NULL DEFAULT '{}',   -- EInvoiceConfig (encrypted creds)
  field_mapping jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug, table_id)
);

CREATE TABLE platform.einvoice_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  record_id text NOT NULL,
  table_id uuid NOT NULL,
  irn text,
  ack_no text,
  ack_dt text,
  signed_qr text,
  status text NOT NULL DEFAULT 'pending',  -- pending|generated|cancelled|error
  error_message text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug, record_id)
);
CREATE INDEX ON platform.einvoice_records(tenant_slug, status);
