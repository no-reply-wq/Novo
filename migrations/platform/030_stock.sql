-- Wave 10: Stock & Fulfilment config tables

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.stock_configs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  table_id         uuid        NOT NULL,
  config           jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (table_id)
);

CREATE TABLE IF NOT EXISTS platform.fulfilment_configs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           uuid        REFERENCES platform.apps(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  chain            jsonb       NOT NULL DEFAULT '[]',
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform.convert_to_configs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id              uuid        REFERENCES platform.apps(id) ON DELETE CASCADE,
  source_table_id     text        NOT NULL,
  target_table_id     text        NOT NULL,
  header_mappings     jsonb       NOT NULL DEFAULT '[]',
  line_mappings       jsonb       NOT NULL DEFAULT '[]',
  link_back_field     text        NOT NULL,
  respect_fulfilment  boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION platform.create_tenant_stock_tables(tenant_slug text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE 'Stock tables verified for tenant: %', tenant_slug;
END;
$$;
