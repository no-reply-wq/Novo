-- Fulfilment links: source line → target line tracking
CREATE TABLE IF NOT EXISTS public.fulfilment_links (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug            TEXT        NOT NULL,
  source_line_table_id   TEXT        NOT NULL,
  source_line_record_id  TEXT        NOT NULL,
  target_line_table_id   TEXT        NOT NULL,
  target_line_record_id  TEXT        NOT NULL,
  qty_linked             NUMERIC     NOT NULL CHECK (qty_linked > 0),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_links_source
  ON public.fulfilment_links(tenant_slug, source_line_table_id, source_line_record_id);

CREATE INDEX IF NOT EXISTS idx_fulfilment_links_target
  ON public.fulfilment_links(tenant_slug, target_line_table_id, target_line_record_id);
