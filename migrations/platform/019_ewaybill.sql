-- E-Way Bill integration tables
-- Requires: NIC e-way bill portal credentials per tenant+table configuration

CREATE TABLE platform.ewaybill_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  app_id uuid NOT NULL,
  table_id uuid NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  field_mapping jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug, table_id)
);

CREATE TABLE platform.ewaybill_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  record_id text NOT NULL,
  table_id uuid NOT NULL,
  ewb_no text,
  ewb_dt text,
  ewb_valid_till text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug, record_id)
);
