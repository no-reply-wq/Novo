-- Migration 031: BOM / Recipe engine
-- Creates tables for bill of materials, work orders, and material consumption

-- ─── BOM Headers ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.bom_headers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        UUID NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'EA',
  version       TEXT NOT NULL DEFAULT 'R0',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bom_headers_app_id      ON platform.bom_headers (app_id);
CREATE INDEX IF NOT EXISTS idx_bom_headers_product_id  ON platform.bom_headers (app_id, product_id);
CREATE INDEX IF NOT EXISTS idx_bom_headers_active      ON platform.bom_headers (app_id, is_active);

-- ─── BOM Lines ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.bom_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id          UUID NOT NULL REFERENCES platform.bom_headers(id) ON DELETE CASCADE,
  component_id    TEXT NOT NULL,
  component_name  TEXT NOT NULL,
  qty_per_unit    NUMERIC(18, 6) NOT NULL CHECK (qty_per_unit > 0),
  unit            TEXT NOT NULL DEFAULT 'EA',
  waste_percent   NUMERIC(5, 2)  NOT NULL DEFAULT 0 CHECK (waste_percent >= 0 AND waste_percent <= 100),
  is_optional     BOOLEAN NOT NULL DEFAULT false,
  is_by_product   BOOLEAN NOT NULL DEFAULT false,
  substitute_ids  TEXT[],
  display_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bom_lines_bom_id ON platform.bom_lines (bom_id);

-- ─── Work Orders ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.work_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        UUID NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  bom_id        UUID NOT NULL REFERENCES platform.bom_headers(id),
  product_id    TEXT NOT NULL,
  target_qty    NUMERIC(18, 6) NOT NULL CHECK (target_qty > 0),
  unit          TEXT NOT NULL DEFAULT 'EA',
  status        TEXT NOT NULL DEFAULT 'Draft'
                  CHECK (status IN ('Draft', 'Released', 'In Progress', 'Completed', 'Cancelled')),
  planned_start DATE,
  planned_end   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_app_id ON platform.work_orders (app_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_bom_id ON platform.work_orders (bom_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON platform.work_orders (app_id, status);

-- ─── Work Order Consumption ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.work_order_consumption (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID NOT NULL REFERENCES platform.work_orders(id) ON DELETE CASCADE,
  component_id    TEXT NOT NULL,
  required_qty    NUMERIC(18, 6) NOT NULL,
  issued_qty      NUMERIC(18, 6) NOT NULL DEFAULT 0,
  returned_qty    NUMERIC(18, 6) NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL DEFAULT 'EA',
  status          TEXT NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending', 'Issued', 'Partial', 'Returned'))
);

CREATE INDEX IF NOT EXISTS idx_woc_work_order_id ON platform.work_order_consumption (work_order_id);

-- ─── Auto-updated_at triggers ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_bom_headers'
  ) THEN
    CREATE TRIGGER set_updated_at_bom_headers
      BEFORE UPDATE ON platform.bom_headers
      FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_work_orders'
  ) THEN
    CREATE TRIGGER set_updated_at_work_orders
      BEFORE UPDATE ON platform.work_orders
      FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
  END IF;
END;
$$;
