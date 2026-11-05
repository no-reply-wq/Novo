-- Stock ledger tables
-- Migration 005: stock movements and balance view

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug TEXT NOT NULL,
  item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  batch_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  qty NUMERIC NOT NULL CHECK (qty > 0),
  source_table_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_by TEXT NOT NULL,
  reversed BOOLEAN NOT NULL DEFAULT false,
  reversal_id UUID REFERENCES public.stock_movements(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON public.stock_movements(tenant_slug, item_id, location_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON public.stock_movements(batch_id) WHERE batch_id IS NOT NULL;

-- Running balance view (for fast reads)
CREATE OR REPLACE VIEW public.stock_balance AS
SELECT
  tenant_slug, item_id, location_id, batch_id,
  SUM(CASE WHEN direction = 'in' THEN qty ELSE -qty END) AS balance
FROM public.stock_movements
WHERE reversed = false
GROUP BY tenant_slug, item_id, location_id, batch_id;
