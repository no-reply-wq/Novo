CREATE TABLE IF NOT EXISTS platform.whitelabel_configs (
  tenant_slug TEXT PRIMARY KEY,
  custom_domain TEXT UNIQUE,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  company_name TEXT,
  support_email TEXT,
  hide_novo_branding BOOLEAN DEFAULT false,
  custom_css TEXT
);
CREATE INDEX IF NOT EXISTS whitelabel_domain_idx ON platform.whitelabel_configs(custom_domain) WHERE custom_domain IS NOT NULL;
