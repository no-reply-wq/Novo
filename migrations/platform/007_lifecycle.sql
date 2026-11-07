-- Migration 007 (lifecycle): App versioning with version_number, environments with settings.

ALTER TABLE platform.app_versions
  ADD COLUMN IF NOT EXISTS version_number INTEGER;

UPDATE platform.app_versions v
SET version_number = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY app_id ORDER BY created_at) AS rn
  FROM platform.app_versions
) sub
WHERE v.id = sub.id AND v.version_number IS NULL;

ALTER TABLE platform.app_versions
  ALTER COLUMN version_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_app_versions_app_id_version_number'
  ) THEN
    ALTER TABLE platform.app_versions
      ADD CONSTRAINT uq_app_versions_app_id_version_number
        UNIQUE (app_id, version_number);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION platform.next_app_version_number(p_app_id TEXT)
  RETURNS INTEGER LANGUAGE sql AS $$
    SELECT COALESCE(MAX(version_number), 0) + 1
    FROM platform.app_versions
    WHERE app_id = p_app_id;
  $$;

ALTER TABLE platform.app_environments
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform'
      AND table_name = 'app_environments'
      AND column_name = 'type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform'
      AND table_name = 'app_environments'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE platform.app_environments RENAME COLUMN type TO name;
  END IF;
END $$;
