-- ============================================================
-- LRBC ERP — Per-Tenant Schema Template
-- Run once per tenant at provisioning time.
-- Replace :schema with the tenant's schema name (e.g. tenant_jeevaka).
-- ============================================================

-- Create isolated schema
CREATE SCHEMA IF NOT EXISTS ":schema";

-- ─────────────────────────────────────────────────────────────
-- RBAC
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".roles (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL UNIQUE,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".users (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role_id       TEXT REFERENCES ":schema".roles(id),
  active        BOOLEAN NOT NULL DEFAULT true,
  token_version INTEGER NOT NULL DEFAULT 0,
  totp_secret   TEXT,
  totp_enabled  BOOLEAN NOT NULL DEFAULT false,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".permissions (
  id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  role_id   TEXT REFERENCES ":schema".roles(id) ON DELETE CASCADE,
  user_id   TEXT REFERENCES ":schema".users(id) ON DELETE CASCADE,
  module    TEXT NOT NULL,
  tab       TEXT,
  action    TEXT NOT NULL,  -- view | create | edit | delete
  granted   BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT chk_role_or_user CHECK (role_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX ON ":schema".permissions(role_id);
CREATE INDEX ON ":schema".permissions(user_id);

-- ─────────────────────────────────────────────────────────────
-- MASTER DATA
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".clients (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company        TEXT NOT NULL,
  contact_name   TEXT,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  gst_number     TEXT,
  pan_number     TEXT,
  payment_term_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".vendors (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company         TEXT NOT NULL,
  contact_name    TEXT,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  gst_number      TEXT,
  pan_number      TEXT,
  payment_term_id TEXT,
  bank_name       TEXT,
  bank_account    TEXT,
  bank_ifsc       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".payment_terms (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL UNIQUE,
  days        INT NOT NULL DEFAULT 30,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK after both tables exist
ALTER TABLE ":schema".clients ADD CONSTRAINT fk_client_payment_term
  FOREIGN KEY (payment_term_id) REFERENCES ":schema".payment_terms(id);
ALTER TABLE ":schema".vendors ADD CONSTRAINT fk_vendor_payment_term
  FOREIGN KEY (payment_term_id) REFERENCES ":schema".payment_terms(id);

CREATE TABLE ":schema".product_categories (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES ":schema".product_categories(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".uoms (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       TEXT NOT NULL UNIQUE,
  abbreviation TEXT
);

CREATE TABLE ":schema".products (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sku             TEXT UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  category_id     TEXT REFERENCES ":schema".product_categories(id),
  uom_id          TEXT REFERENCES ":schema".uoms(id),
  type            TEXT NOT NULL DEFAULT 'product',  -- product | raw_material | finished_good | service
  unit_cost       NUMERIC(15,2),
  unit_price      NUMERIC(15,2),
  reorder_point   INT DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- CRM / LEADS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".lead_stages (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  color      TEXT DEFAULT '#6366f1',
  is_won     BOOLEAN DEFAULT false,
  is_lost    BOOLEAN DEFAULT false
);

CREATE TABLE ":schema".leads (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title         TEXT NOT NULL,
  client_id     TEXT REFERENCES ":schema".clients(id),
  contact_name  TEXT,
  email         TEXT,
  phone         TEXT,
  stage_id      TEXT REFERENCES ":schema".lead_stages(id),
  expected_value NUMERIC(15,2),
  probability   INT DEFAULT 50,
  expected_close DATE,
  assigned_to   TEXT REFERENCES ":schema".users(id),
  notes         TEXT,
  source        TEXT,
  created_by    TEXT REFERENCES ":schema".users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".lead_items (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_id     TEXT NOT NULL REFERENCES ":schema".leads(id) ON DELETE CASCADE,
  product_id  TEXT REFERENCES ":schema".products(id),
  description TEXT,
  quantity    NUMERIC(15,3),
  unit_price  NUMERIC(15,2),
  amount      NUMERIC(15,2),
  sort_order  INT DEFAULT 0
);

CREATE TABLE ":schema".lead_activity (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lead_id    TEXT NOT NULL REFERENCES ":schema".leads(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES ":schema".users(id),
  type       TEXT NOT NULL,  -- note | call | email | meeting | status_change
  content    TEXT,
  meta       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- QUOTATIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".quotations (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  thread_id      TEXT NOT NULL,  -- groups revisions together
  revision       INT NOT NULL DEFAULT 1,
  is_latest      BOOLEAN NOT NULL DEFAULT true,
  number         TEXT UNIQUE,
  client_id      TEXT REFERENCES ":schema".clients(id),
  lead_id        TEXT REFERENCES ":schema".leads(id),
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until    DATE,
  payment_term_id TEXT REFERENCES ":schema".payment_terms(id),
  status         TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | approved | rejected | converted
  subtotal       NUMERIC(15,2) DEFAULT 0,
  tax_amount     NUMERIC(15,2) DEFAULT 0,
  total          NUMERIC(15,2) DEFAULT 0,
  notes          TEXT,
  terms          TEXT,
  pdf_url        TEXT,
  created_by     TEXT REFERENCES ":schema".users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON ":schema".quotations(thread_id);
CREATE INDEX ON ":schema".quotations(client_id);

CREATE TABLE ":schema".quotation_items (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quotation_id     TEXT NOT NULL REFERENCES ":schema".quotations(id) ON DELETE CASCADE,
  product_id       TEXT REFERENCES ":schema".products(id),
  description      TEXT,
  quantity         NUMERIC(15,3) NOT NULL DEFAULT 1,
  unit_price       NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  tax_percent      NUMERIC(5,2) DEFAULT 0,
  amount           NUMERIC(15,2) DEFAULT 0,
  sort_order       INT DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- SALES ORDERS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".sales_orders (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  number          TEXT UNIQUE,
  quotation_id    TEXT REFERENCES ":schema".quotations(id),
  client_id       TEXT REFERENCES ":schema".clients(id),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date   DATE,
  payment_term_id TEXT REFERENCES ":schema".payment_terms(id),
  status          TEXT NOT NULL DEFAULT 'confirmed',
  subtotal        NUMERIC(15,2) DEFAULT 0,
  tax_amount      NUMERIC(15,2) DEFAULT 0,
  total           NUMERIC(15,2) DEFAULT 0,
  notes           TEXT,
  created_by      TEXT REFERENCES ":schema".users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".sales_order_items (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sales_order_id TEXT NOT NULL REFERENCES ":schema".sales_orders(id) ON DELETE CASCADE,
  product_id     TEXT REFERENCES ":schema".products(id),
  description    TEXT,
  quantity       NUMERIC(15,3) NOT NULL DEFAULT 1,
  unit_price     NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount         NUMERIC(15,2) DEFAULT 0,
  delivered_qty  NUMERIC(15,3) DEFAULT 0,
  sort_order     INT DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- PURCHASE — INDENT → PO → GRN
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".indents (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  number      TEXT UNIQUE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  department  TEXT,
  required_by DATE,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | po_raised | fulfilled
  notes       TEXT,
  requested_by TEXT REFERENCES ":schema".users(id),
  approved_by  TEXT REFERENCES ":schema".users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".indent_items (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  indent_id   TEXT NOT NULL REFERENCES ":schema".indents(id) ON DELETE CASCADE,
  product_id  TEXT REFERENCES ":schema".products(id),
  description TEXT,
  quantity    NUMERIC(15,3) NOT NULL DEFAULT 1,
  uom_id      TEXT REFERENCES ":schema".uoms(id),
  sort_order  INT DEFAULT 0
);

CREATE TABLE ":schema".purchase_orders (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  number          TEXT UNIQUE,
  vendor_id       TEXT REFERENCES ":schema".vendors(id),
  indent_id       TEXT REFERENCES ":schema".indents(id),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date   DATE,
  payment_term_id TEXT REFERENCES ":schema".payment_terms(id),
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | acknowledged | partially_received | received | cancelled
  subtotal        NUMERIC(15,2) DEFAULT 0,
  tax_amount      NUMERIC(15,2) DEFAULT 0,
  total           NUMERIC(15,2) DEFAULT 0,
  notes           TEXT,
  terms           TEXT,
  pdf_url         TEXT,
  created_by      TEXT REFERENCES ":schema".users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON ":schema".purchase_orders(vendor_id);

CREATE TABLE ":schema".purchase_order_items (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  purchase_order_id TEXT NOT NULL REFERENCES ":schema".purchase_orders(id) ON DELETE CASCADE,
  product_id        TEXT REFERENCES ":schema".products(id),
  description       TEXT,
  quantity          NUMERIC(15,3) NOT NULL DEFAULT 1,
  unit_cost         NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_percent       NUMERIC(5,2) DEFAULT 0,
  amount            NUMERIC(15,2) DEFAULT 0,
  received_qty      NUMERIC(15,3) DEFAULT 0,
  sort_order        INT DEFAULT 0
);

CREATE TABLE ":schema".goods_receipts (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  number            TEXT UNIQUE,
  purchase_order_id TEXT REFERENCES ":schema".purchase_orders(id),
  vendor_id         TEXT REFERENCES ":schema".vendors(id),
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  status            TEXT NOT NULL DEFAULT 'draft',
  notes             TEXT,
  created_by        TEXT REFERENCES ":schema".users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".goods_receipt_items (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  goods_receipt_id TEXT NOT NULL REFERENCES ":schema".goods_receipts(id) ON DELETE CASCADE,
  po_item_id       TEXT REFERENCES ":schema".purchase_order_items(id),
  product_id       TEXT REFERENCES ":schema".products(id),
  description      TEXT,
  quantity         NUMERIC(15,3) NOT NULL DEFAULT 1,
  unit_cost        NUMERIC(15,2) DEFAULT 0,
  sort_order       INT DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- INVENTORY / STOCK LEDGER
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".warehouses (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       TEXT NOT NULL,
  address    TEXT,
  active     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE ":schema".stock_ledger (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id       TEXT NOT NULL REFERENCES ":schema".products(id),
  warehouse_id     TEXT REFERENCES ":schema".warehouses(id),
  transaction_type TEXT NOT NULL,   -- receipt | issue | adjustment | transfer_in | transfer_out
  reference_type   TEXT,            -- goods_receipt | sales_order | manual
  reference_id     TEXT,
  quantity         NUMERIC(15,3) NOT NULL,  -- positive = in, negative = out
  unit_cost        NUMERIC(15,2),
  running_balance  NUMERIC(15,3),
  notes            TEXT,
  created_by       TEXT REFERENCES ":schema".users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON ":schema".stock_ledger(product_id);
CREATE INDEX ON ":schema".stock_ledger(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- EXPENSES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".expense_categories (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL,
  description TEXT,
  gl_code     TEXT
);

CREATE TABLE ":schema".expense_rates (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category_id         TEXT REFERENCES ":schema".expense_categories(id),
  name                TEXT NOT NULL,
  rate                NUMERIC(15,2),
  uom                 TEXT,
  effective_from      DATE,
  effective_to        DATE
);

CREATE TABLE ":schema".expenses (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  number        TEXT UNIQUE,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id   TEXT REFERENCES ":schema".expense_categories(id),
  description   TEXT NOT NULL,
  amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount    NUMERIC(15,2) DEFAULT 0,
  total         NUMERIC(15,2) DEFAULT 0,
  vendor_id     TEXT REFERENCES ":schema".vendors(id),
  receipt_url   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | paid
  submitted_by  TEXT REFERENCES ":schema".users(id),
  approved_by   TEXT REFERENCES ":schema".users(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- FORM BUILDER
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".form_configs (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  description           TEXT,
  category              TEXT,
  -- Sidebar tab settings
  show_as_tab           BOOLEAN NOT NULL DEFAULT false,
  tab_label             TEXT,
  tab_icon              TEXT,
  tab_visible_roles     TEXT[] DEFAULT '{}',
  tab_sort_order        INT DEFAULT 999,
  -- Table columns to display in browse view
  table_columns         JSONB DEFAULT '[]',   -- [{key, label, type}]
  -- Board (Kanban) view — groups submissions into columns by a dropdown
  -- field's value, with drag-and-drop to change that value
  board_view_enabled    BOOLEAN NOT NULL DEFAULT false,
  board_group_by_field  TEXT,                 -- field_key of a dropdown field on this form
  -- Revisioning — when enabled, editing a submission offers "Save as
  -- New Revision" instead of only overwriting in place
  revisioning_enabled   BOOLEAN NOT NULL DEFAULT false,
  -- PDF
  pdf_template_url      TEXT,
  pdf_output_folder     TEXT,
  -- Line-items auto-fill config
  autofill_source_field TEXT,                 -- field key that triggers line-item fill
  autofill_child_table  TEXT,                 -- e.g. "quotation_items"
  autofill_link_column  TEXT,                 -- e.g. "quotation_id"
  autofill_column_map   JSONB DEFAULT '{}',   -- {"form_field_key": "db_column"}
  -- Meta
  active                BOOLEAN NOT NULL DEFAULT true,
  created_by            TEXT REFERENCES ":schema".users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ":schema".form_fields (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  form_id                  TEXT NOT NULL REFERENCES ":schema".form_configs(id) ON DELETE CASCADE,
  key                      TEXT NOT NULL,                -- machine-readable, unique within form
  label                    TEXT NOT NULL,
  field_type               TEXT NOT NULL,                -- text | number | dropdown | date | textarea | checkbox | formula
  is_line_item             BOOLEAN NOT NULL DEFAULT false,
  is_required              BOOLEAN NOT NULL DEFAULT false,
  is_readonly              BOOLEAN NOT NULL DEFAULT false,
  sort_order               INT NOT NULL DEFAULT 0,
  placeholder              TEXT,
  default_value            TEXT,
  width                    TEXT DEFAULT 'full',          -- full | half | third
  -- Dropdown source
  dropdown_type            TEXT,                         -- static | dynamic
  dropdown_static_options  JSONB DEFAULT '[]',           -- [{label, value}]
  dropdown_source_table    TEXT,
  dropdown_source_schema   TEXT,                         -- if null, use tenant schema
  dropdown_value_column    TEXT,
  dropdown_label_column    TEXT,
  dropdown_filter_column   TEXT,                         -- column to filter by
  dropdown_filter_field    TEXT,                         -- depends on this form field key
  dropdown_filter_value    TEXT,                         -- fixed value (if not depends-on)
  -- Formula
  formula_type             TEXT,                         -- sum_column | expression
  formula_expression       TEXT,                         -- e.g. "quantity * unit_price"
  formula_target_field     TEXT,                         -- field key to sum (for sum_column)
  -- Single-field autofill
  autofill_source_field    TEXT,                         -- which field drives this one
  autofill_column          TEXT,                         -- which column from that field's table
  -- Serial/row number
  is_row_number            BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (form_id, key)
);

CREATE INDEX ON ":schema".form_fields(form_id, sort_order);

CREATE TABLE ":schema".form_submissions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  form_id     TEXT NOT NULL REFERENCES ":schema".form_configs(id),
  is_test     BOOLEAN NOT NULL DEFAULT false,
  header_data JSONB NOT NULL DEFAULT '{}',   -- {field_key: value}
  pdf_url     TEXT,
  document_number TEXT,
  submitted_by TEXT REFERENCES ":schema".users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Revisioning — a "revision" is a new row sharing the same thread_id
  -- as the original. thread_id = id for a submission's first revision
  -- (self-referencing), so every submission is trivially part of a
  -- thread even before it's ever been revised.
  thread_id       TEXT,
  revision_number INT NOT NULL DEFAULT 1,
  is_latest       BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX ON ":schema".form_submissions(form_id);
CREATE INDEX ON ":schema".form_submissions(is_test);
CREATE INDEX ON ":schema".form_submissions(thread_id);

CREATE TABLE ":schema".form_submission_items (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  submission_id TEXT NOT NULL REFERENCES ":schema".form_submissions(id) ON DELETE CASCADE,
  row_index     INT NOT NULL,
  item_data     JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX ON ":schema".form_submission_items(submission_id);

-- ─────────────────────────────────────────────────────────────
-- UI BUILDER
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".ui_buttons (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  page_key       TEXT NOT NULL,              -- e.g. "leads" | "quotations" | "custom:form_slug"
  label          TEXT NOT NULL,
  icon           TEXT,
  placement      TEXT NOT NULL DEFAULT 'toolbar',  -- toolbar | row_actions
  form_id        TEXT REFERENCES ":schema".form_configs(id),
  prefill_field  TEXT,                       -- which form field gets the row ID (for row_actions)
  visible_roles  TEXT[] DEFAULT '{}',        -- empty = all roles
  sort_order     INT DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON ":schema".ui_buttons(page_key);

CREATE TABLE ":schema".ui_tables (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  page_key        TEXT NOT NULL,
  title           TEXT,
  source_table    TEXT NOT NULL,             -- which table to query
  source_schema   TEXT,                      -- if null, use tenant schema
  columns         JSONB NOT NULL DEFAULT '[]', -- [{key, label, type}]
  filters         JSONB DEFAULT '[]',        -- [{column, value}] fixed filters
  show_sum_row    BOOLEAN NOT NULL DEFAULT false,
  sum_columns     TEXT[] DEFAULT '{}',
  collapsible     BOOLEAN NOT NULL DEFAULT false,
  default_collapsed BOOLEAN NOT NULL DEFAULT false,
  visible_roles   TEXT[] DEFAULT '{}',
  sort_order      INT DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON ":schema".ui_tables(page_key);

CREATE TABLE ":schema".ui_visibility_rules (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  page_key     TEXT NOT NULL,
  column_label TEXT NOT NULL,               -- exact column header text to hide
  hidden_roles TEXT[] DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOG (tenant-level)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE ":schema".audit_log (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT REFERENCES ":schema".users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  changes     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON ":schema".audit_log(created_at DESC);
CREATE INDEX ON ":schema".audit_log(entity_type, entity_id);

-- ─────────────────────────────────────────────────────────────
-- SEED: Default roles and permissions
-- ─────────────────────────────────────────────────────────────

INSERT INTO ":schema".roles (name, is_system) VALUES
  ('admin', true),
  ('manager', true),
  ('staff', true);

-- Default pipeline stages
INSERT INTO ":schema".lead_stages (name, sort_order, color) VALUES
  ('New', 0, '#94a3b8'),
  ('Contacted', 1, '#60a5fa'),
  ('Qualified', 2, '#a78bfa'),
  ('Proposal', 3, '#f59e0b'),
  ('Negotiation', 4, '#f97316'),
  ('Won', 5, '#22c55e'),
  ('Lost', 6, '#ef4444');

UPDATE ":schema".lead_stages SET is_won = true WHERE name = 'Won';
UPDATE ":schema".lead_stages SET is_lost = true WHERE name = 'Lost';

-- Default UOMs
INSERT INTO ":schema".uoms (name, abbreviation) VALUES
  ('Each', 'ea'), ('Kilogram', 'kg'), ('Gram', 'g'), ('Litre', 'L'),
  ('Millilitre', 'mL'), ('Metre', 'm'), ('Centimetre', 'cm'),
  ('Square Metre', 'sqm'), ('Box', 'box'), ('Carton', 'ctn'),
  ('Set', 'set'), ('Pair', 'pr'), ('Hour', 'hr'), ('Day', 'day');

-- Default payment terms
INSERT INTO ":schema".payment_terms (name, days) VALUES
  ('Immediate', 0), ('Net 7', 7), ('Net 15', 15),
  ('Net 30', 30), ('Net 45', 45), ('Net 60', 60);

-- Default warehouse
INSERT INTO ":schema".warehouses (name) VALUES ('Main Warehouse');

-- ─── Workflows ───────────────────────────────────────────────────────────────

CREATE TABLE ":schema".workflows (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  app_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  trigger     JSONB NOT NULL DEFAULT '{}',
  actions     JSONB NOT NULL DEFAULT '[]',
  enabled     BOOLEAN NOT NULL DEFAULT false,
  version     INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Scripts ─────────────────────────────────────────────────────────────────

CREATE TABLE ":schema".scripts (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  app_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  language    TEXT NOT NULL DEFAULT 'javascript',
  code        TEXT NOT NULL DEFAULT '',
  version     INT NOT NULL DEFAULT 1,
  test_cases  JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Approval Chains ─────────────────────────────────────────────────────────

CREATE TABLE ":schema".approval_chains (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  app_id           TEXT NOT NULL,
  name             TEXT NOT NULL,
  table_id         TEXT NOT NULL DEFAULT '',
  levels           JSONB NOT NULL DEFAULT '[]',
  on_approved      JSONB,
  on_rejected      JSONB,
  amount_field_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── App-level Role Permissions ──────────────────────────────────────────────
-- Grants roles access to specific pages/resources within portal apps.
-- resource_type: 'page' | 'table' | 'app'
-- resource_id:   page slug, table name, app slug, or '*' for wildcard
-- action:        'view' | 'edit' | 'delete' | '*'

CREATE TABLE IF NOT EXISTS ":schema".role_permissions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  role_id       TEXT NOT NULL REFERENCES ":schema".roles(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  action        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, resource_type, resource_id, action)
);

-- Allows a user to hold multiple roles (in addition to the single role_id on users).
-- The single role_id is authoritative for legacy module permissions;
-- user_roles is used for portal app page-level access.

CREATE TABLE IF NOT EXISTS ":schema".user_roles (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES ":schema".users(id) ON DELETE CASCADE,
  role_id    TEXT NOT NULL REFERENCES ":schema".roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role_id)
);
