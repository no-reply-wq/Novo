-- Wave 8: table relations and child table config

CREATE TABLE IF NOT EXISTS platform.table_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES platform.apps(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('one_to_many', 'many_to_many', 'self')),
  source_table_id uuid NOT NULL,
  target_table_id uuid NOT NULL,
  source_field text NOT NULL,
  target_field text,
  junction_table text,
  cascade_on_delete text NOT NULL DEFAULT 'restrict' CHECK (cascade_on_delete IN ('restrict', 'cascade', 'set_null')),
  cascade_on_update text NOT NULL DEFAULT 'restrict' CHECK (cascade_on_update IN ('restrict', 'cascade', 'set_null')),
  inverse_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS table_relations_app_id_idx ON platform.table_relations(app_id);
CREATE INDEX IF NOT EXISTS table_relations_source_idx ON platform.table_relations(source_table_id);
CREATE INDEX IF NOT EXISTS table_relations_target_idx ON platform.table_relations(target_table_id);

CREATE TABLE IF NOT EXISTS platform.child_table_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_table_id uuid NOT NULL,
  child_table_id uuid NOT NULL,
  parent_field text NOT NULL,
  depth integer NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  allow_add boolean NOT NULL DEFAULT true,
  allow_delete boolean NOT NULL DEFAULT true,
  allow_reorder boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS child_table_configs_parent_idx ON platform.child_table_configs(parent_table_id);
CREATE INDEX IF NOT EXISTS child_table_configs_child_idx ON platform.child_table_configs(child_table_id);
