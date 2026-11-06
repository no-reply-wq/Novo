-- Migration 030: Stock engine config, fulfilment config, convert-to config
-- Wave 10 — extended configuration tables for the no-code builder.
--
-- The raw movement tables already exist (005_stock_tables.sql, 006_fulfilment_tables.sql).
-- This migration adds:
--   • platform.stock_configs      — which tables auto-post stock movements
--   • platform.fulfilment_configs — multi-stage fulfilment chains
--   • platform.convert_to_configs — convert-to button configurations
--   • platform.create_tenant_stock_tables() — per-tenant ledger helper

-- ─── Stock config ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.stock_configs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  table_id   uuid        NOT NULL,
  config     jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_configs_app
  ON platform.stock_configs(app_id);

-- ─── Fulfilment config ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.fulfilment_configs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  chain      jsonb       NOT NULL,  -- FulfilmentStage[]
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_configs_app
  ON platform.fulfilment_configs(app_id);

-- ─── Convert-to config ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.convert_to_configs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id               uuid        NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  source_table_id      text        NOT NULL,
  target_table_id      text        NOT NULL,
  header_mappings      jsonb       NOT NULL,  -- ConvertToFieldMapping[]
  line_mappings        jsonb,                 -- ConvertToLineMapping[] | null
  link_back_field      text        NOT NULL,
  respect_fulfilment   boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_convert_to_configs_app
  ON platform.convert_to_configs(app_id);

-- ─── Per-tenant stock ledger helper ──────────────────────────────────────────
-- Call this once per new tenant to create their schema-local stock tables.
-- The platform-level public.stock_movements table remains the primary ledger;
-- this helper creates a tenant-scoped mirror if isolating ledger rows is needed.

CREATE OR REPLACE FUNCTION platform.create_tenant_stock_tables(tenant_slug text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.stock_ledger (
        id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id          text        NOT NULL,
        location_id      text        NOT NULL,
        batch_no         text,
        expiry_date      date,
        direction        text        NOT NULL CHECK (direction IN ('in','out')),
        qty              numeric     NOT NULL CHECK (qty > 0),
        cost_per_unit    numeric,
        source_table_id  uuid        NOT NULL,
        source_record_id text        NOT NULL,
        posted_at        timestamptz NOT NULL DEFAULT now(),
        reversed_at      timestamptz,
        UNIQUE (source_table_id, source_record_id)
      )
    $sql$,
    'tenant_' || tenant_slug
  );

  EXECUTE format(
    $sql$
      CREATE INDEX IF NOT EXISTS stock_ledger_item_loc
        ON %I.stock_ledger(item_id, location_id, batch_no)
        WHERE reversed_at IS NULL
    $sql$,
    'tenant_' || tenant_slug
  );
END;
$$;
