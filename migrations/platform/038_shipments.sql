CREATE TABLE IF NOT EXISTS platform.shipments (
  id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  app_id TEXT,
  record_id TEXT,
  provider TEXT NOT NULL,
  awb_number TEXT NOT NULL,
  tracking_number TEXT,
  status TEXT DEFAULT 'booked',
  charges NUMERIC(12,2),
  booked_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shipments_tenant_idx ON platform.shipments(tenant_slug);
CREATE INDEX IF NOT EXISTS shipments_awb_idx ON platform.shipments(awb_number);
CREATE INDEX IF NOT EXISTS shipments_record_idx ON platform.shipments(record_id);
