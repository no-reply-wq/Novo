-- BOM (Bill of Materials) / Recipe engine migration
-- Wave 10, Agent A2

CREATE TABLE platform.bom_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  product_name text NOT NULL,
  unit text NOT NULL,
  version text NOT NULL DEFAULT 'R0',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bom_headers_app_id ON platform.bom_headers(app_id);
CREATE INDEX idx_bom_headers_product_id ON platform.bom_headers(app_id, product_id);
CREATE UNIQUE INDEX idx_bom_headers_active_version
  ON platform.bom_headers(app_id, product_id, version)
  WHERE is_active = true;

CREATE TABLE platform.bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id uuid NOT NULL REFERENCES platform.bom_headers(id) ON DELETE CASCADE,
  component_id text NOT NULL,
  component_name text NOT NULL,
  qty_per_unit numeric NOT NULL CHECK (qty_per_unit > 0),
  unit text NOT NULL,
  waste_percent numeric NOT NULL DEFAULT 0 CHECK (waste_percent >= 0 AND waste_percent <= 100),
  is_optional boolean NOT NULL DEFAULT false,
  is_by_product boolean NOT NULL DEFAULT false,
  substitute_ids text[] NOT NULL DEFAULT '{}',
  display_order integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_bom_lines_bom_id ON platform.bom_lines(bom_id);

CREATE TABLE platform.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  bom_id uuid NOT NULL REFERENCES platform.bom_headers(id),
  product_id text NOT NULL,
  target_qty numeric NOT NULL CHECK (target_qty > 0),
  unit text NOT NULL,
  status text NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Released', 'In Progress', 'Completed', 'Cancelled')),
  planned_start date,
  planned_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_orders_app_id ON platform.work_orders(app_id);
CREATE INDEX idx_work_orders_bom_id ON platform.work_orders(bom_id);
CREATE INDEX idx_work_orders_status ON platform.work_orders(app_id, status);

CREATE TABLE platform.work_order_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES platform.work_orders(id) ON DELETE CASCADE,
  component_id text NOT NULL,
  required_qty numeric NOT NULL,
  issued_qty numeric NOT NULL DEFAULT 0,
  returned_qty numeric NOT NULL DEFAULT 0,
  unit text NOT NULL,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Issued', 'Partial', 'Returned'))
);

CREATE INDEX idx_work_order_consumption_wo_id ON platform.work_order_consumption(work_order_id);

-- Auto-update updated_at for work orders
CREATE OR REPLACE FUNCTION platform.set_work_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON platform.work_orders
  FOR EACH ROW EXECUTE FUNCTION platform.set_work_orders_updated_at();

CREATE OR REPLACE FUNCTION platform.set_bom_headers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bom_headers_updated_at
  BEFORE UPDATE ON platform.bom_headers
  FOR EACH ROW EXECUTE FUNCTION platform.set_bom_headers_updated_at();
