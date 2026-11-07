-- Wave 2 Agent H: Stock ledger with batch/lot/expiry tracking
-- and stock_config table for per-app movement configurations

CREATE TABLE IF NOT EXISTS platform.stock_ledger (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  tenant_slug TEXT NOT NULL,
  table_api_key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  qty NUMERIC(18,4) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  batch_no TEXT,
  lot_no TEXT,
  expiry_date DATE,
  posted_at TIMESTAMPTZ DEFAULT now(),
  posted_by TEXT,
  reversed_at TIMESTAMPTZ,
  reversed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_item_location
  ON platform.stock_ledger(app_id, item_id, location_id);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_record
  ON platform.stock_ledger(app_id, table_api_key, record_id);

CREATE TABLE IF NOT EXISTS platform.stock_config (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
