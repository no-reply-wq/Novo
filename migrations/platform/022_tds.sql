-- Migration: 022_tds
-- TDS (Tax Deducted at Source) configuration and records tables

CREATE TABLE IF NOT EXISTS platform.tds_configs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug text        NOT NULL,
  app_id      uuid        NOT NULL,
  config      jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_slug, app_id)
);

CREATE TABLE IF NOT EXISTS platform.tds_records (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug         text        NOT NULL,
  payment_record_id   text        NOT NULL,
  vendor_id           text        NOT NULL,
  vendor_name         text,
  vendor_pan          text,
  section             text        NOT NULL,
  gross_amount        numeric     NOT NULL,
  tds_rate            numeric     NOT NULL,
  tds_amount          numeric     NOT NULL,
  net_amount          numeric     NOT NULL,
  financial_year      text        NOT NULL,
  quarter             integer,
  payment_date        date,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tds_records_tenant_fy_section_idx
  ON platform.tds_records (tenant_slug, financial_year, section);

CREATE INDEX IF NOT EXISTS tds_records_tenant_vendor_idx
  ON platform.tds_records (tenant_slug, vendor_id);
