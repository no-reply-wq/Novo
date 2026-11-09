-- Migration 053: Seed a demo "Leads" page into the first available app
-- Run this AFTER at least one app exists in public.apps.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

DO $$
DECLARE
  v_app_id uuid;
BEGIN
  -- Get the first app's ID
  SELECT id INTO v_app_id FROM public.apps ORDER BY created_at LIMIT 1;

  IF v_app_id IS NULL THEN
    RAISE NOTICE 'No apps found in public.apps — skipping demo page seed.';
    RETURN;
  END IF;

  -- Create platform.app_pages if it doesn't exist yet
  CREATE TABLE IF NOT EXISTS platform.app_pages (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id            uuid        NOT NULL,
    name              TEXT        NOT NULL,
    slug              TEXT        NOT NULL,
    canvas_definition jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (app_id, slug)
  );

  INSERT INTO platform.app_pages (app_id, name, slug, canvas_definition)
  VALUES (
    v_app_id,
    'Leads',
    'leads',
    '{"components": [{"type": "table_view", "tableName": "leads", "title": "Leads", "id": "comp1"}]}'::jsonb
  )
  ON CONFLICT (app_id, slug) DO NOTHING;

  RAISE NOTICE 'Demo Leads page seeded for app %', v_app_id;
END;
$$;
