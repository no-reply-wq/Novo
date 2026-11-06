-- GST R1 filing tables

CREATE TABLE platform.gstr1_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  app_id uuid NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug, app_id)
);

CREATE TABLE platform.gstr1_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text NOT NULL,
  period text NOT NULL,     -- "012024"
  status text NOT NULL DEFAULT 'draft',
  summary jsonb,            -- aggregated GSTR1Return
  invoice_count integer,
  total_taxable_value numeric,
  total_tax numeric,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug, period)
);
