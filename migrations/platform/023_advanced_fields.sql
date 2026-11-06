-- Migration 023: Advanced computed field infrastructure
--
-- Adds the platform.auto_number_sequences table used by the auto-number engine
-- (src/platform/data/auto-number.ts) for atomic, gap-free sequence increment.
--
-- Design:
--   - One row per (table_id, format_key).
--   - last_value is incremented inside a transaction with SELECT … FOR UPDATE.
--   - reset_period ('yearly', 'monthly', or NULL/'never') controls when the
--     counter resets to 1.
--   - reset_at stores the timestamp of the last allocation (used to detect
--     period rollovers: if the year/month of reset_at differs from now,
--     the counter resets).
--
-- The public.sequences table (migration 009) is kept for backwards compat.
-- New code uses platform.auto_number_sequences.

CREATE TABLE IF NOT EXISTS platform.auto_number_sequences (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id      uuid        NOT NULL,
  format_key    text        NOT NULL,
  last_value    bigint      NOT NULL DEFAULT 0,
  reset_period  text        CHECK (reset_period IN ('yearly', 'monthly', 'never')),
  reset_at      timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, format_key)
);

-- Index for fast lookup by table
CREATE INDEX IF NOT EXISTS auto_number_sequences_table_id_idx
  ON platform.auto_number_sequences (table_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION platform.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'auto_number_sequences_updated_at'
      AND tgrelid = 'platform.auto_number_sequences'::regclass
  ) THEN
    CREATE TRIGGER auto_number_sequences_updated_at
      BEFORE UPDATE ON platform.auto_number_sequences
      FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();
  END IF;
END;
$$;

-- Comment documentation
COMMENT ON TABLE platform.auto_number_sequences IS
  'Atomic sequence counters for auto_number field type. '
  'Each row holds the last allocated value for one (table, format) combination. '
  'Consumers must use SELECT … FOR UPDATE inside a transaction.';

COMMENT ON COLUMN platform.auto_number_sequences.format_key IS
  'Stable identifier for this sequence. Defaults to ''field:<field_uuid>''. '
  'Multiple tables can share a sequence by using the same format_key.';

COMMENT ON COLUMN platform.auto_number_sequences.reset_period IS
  '''yearly'' resets on year change, ''monthly'' on month change, '
  '''never'' (or NULL) means never reset.';

COMMENT ON COLUMN platform.auto_number_sequences.reset_at IS
  'Timestamp of the last allocation. Used to detect period rollover.';
