CREATE TABLE platform.portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  tenant_slug text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  type text NOT NULL DEFAULT 'customer',
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug, slug)
);

CREATE TABLE platform.portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES platform.portals(id) ON DELETE CASCADE,
  tenant_slug text NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE(portal_id, email)
);
CREATE INDEX ON platform.portal_users(tenant_slug, email);
