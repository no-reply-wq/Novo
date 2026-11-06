/**
 * Apply a reviewed AI-generated draft to create the real app structure.
 * Creates the app record, tables, fields, pages, and workflows.
 */

import { v4 as uuid } from 'uuid';
import type { PoolClient } from 'pg';
import { pgPool, tenantQuery } from '@/lib/db/client';
import type { GeneratedAppDraft, GeneratedTable, GeneratedField } from './types';

export interface ApplyDraftResult {
  appId: string;
  tablesCreated: number;
  pagesCreated: number;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function toSchemaName(tenantSlug: string): string {
  // Tenant schemas follow the pattern used elsewhere in the codebase
  return `tenant_${tenantSlug.replace(/-/g, '_')}`;
}

async function ensureMetaTables(schemaName: string): Promise<void> {
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS _tables (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      app_id TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      icon TEXT DEFAULT 'table',
      color TEXT DEFAULT '#6366f1',
      description TEXT,
      is_hidden BOOLEAN DEFAULT false,
      rank INT DEFAULT 0,
      schema_version INT DEFAULT 1,
      soft_delete JSONB,
      audit_config JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(app_id, slug)
    )`
  );
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS _fields (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      table_id TEXT NOT NULL REFERENCES _tables(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      options JSONB DEFAULT '{}',
      is_required BOOLEAN DEFAULT false,
      is_unique BOOLEAN DEFAULT false,
      is_system BOOLEAN DEFAULT false,
      default_value TEXT,
      lock_when TEXT,
      hint TEXT,
      field_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(table_id, slug)
    )`
  );
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS _pages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      app_id TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      components JSONB DEFAULT '[]',
      rank INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(app_id, slug)
    )`
  );
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS _workflows (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      app_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      description TEXT,
      steps JSONB DEFAULT '[]',
      enabled BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );
}

async function createTable(
  schemaName: string,
  appId: string,
  table: GeneratedTable,
  rank: number
): Promise<string> {
  const tableId = uuid();
  const slug = table.slug || toSlug(table.name);

  await tenantQuery(
    schemaName,
    `INSERT INTO _tables (id, app_id, slug, label, description, rank)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (app_id, slug) DO NOTHING`,
    [tableId, appId, slug, table.name, table.description, rank]
  );

  // Create the physical table
  await tenantQuery(
    schemaName,
    `CREATE TABLE IF NOT EXISTS ct_${slug} (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );

  // Insert system fields
  const systemFields = [
    { slug: 'id', label: 'ID', type: 'text', order: 0, isSystem: true },
    { slug: 'created_at', label: 'Created At', type: 'datetime', order: 998, isSystem: true },
    { slug: 'updated_at', label: 'Updated At', type: 'datetime', order: 999, isSystem: true },
  ];

  for (const sf of systemFields) {
    await tenantQuery(
      schemaName,
      `INSERT INTO _fields (id, table_id, slug, label, type, is_system, field_order)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       ON CONFLICT (table_id, slug) DO NOTHING`,
      [uuid(), tableId, sf.slug, sf.label, sf.type, sf.order]
    );
  }

  // Insert user-defined fields
  for (let i = 0; i < table.fields.length; i++) {
    const field: GeneratedField = table.fields[i];
    const fieldSlug = field.apiKey || toSlug(field.name);
    const options: Record<string, unknown> = {};

    if (field.options && field.options.length > 0) {
      options.choices = field.options.map((o, idx) => ({ id: String(idx), label: o, color: null }));
    }
    if (field.formula) {
      options.formula = field.formula;
    }

    await tenantQuery(
      schemaName,
      `INSERT INTO _fields (id, table_id, slug, label, type, options, is_required, field_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (table_id, slug) DO NOTHING`,
      [
        uuid(),
        tableId,
        fieldSlug,
        field.name,
        field.type,
        JSON.stringify(options),
        field.required ?? false,
        i + 1,
      ]
    );
  }

  return tableId;
}

export async function applyDraft(
  draftId: string,
  tenantSlug: string,
  userId: string,
  _db: PoolClient
): Promise<ApplyDraftResult> {
  // Fetch the draft
  const draftResult = await pgPool.query<{
    id: string;
    tenant_slug: string;
    status: string;
    draft: GeneratedAppDraft;
  }>(
    `SELECT id, tenant_slug, status, draft
     FROM platform.app_generation_drafts
     WHERE id = $1 AND tenant_slug = $2`,
    [draftId, tenantSlug]
  );

  if (draftResult.rows.length === 0) {
    throw new Error(`Draft not found: ${draftId}`);
  }

  const row = draftResult.rows[0];
  if (row.status === 'published') {
    throw new Error('Draft has already been applied');
  }

  const draft: GeneratedAppDraft = row.draft;

  // Create app record
  const appId = uuid();
  await pgPool.query(
    `INSERT INTO public.apps (id, tenant_slug, name, description, icon)
     VALUES ($1, $2, $3, $4, $5)`,
    [appId, tenantSlug, draft.app.name, draft.app.description, draft.app.icon]
  );

  const schemaName = toSchemaName(tenantSlug);
  await ensureMetaTables(schemaName);

  // Create tables
  let tablesCreated = 0;
  for (let i = 0; i < draft.tables.length; i++) {
    await createTable(schemaName, appId, draft.tables[i], i);
    tablesCreated++;
  }

  // Create pages
  let pagesCreated = 0;
  for (let i = 0; i < draft.pages.length; i++) {
    const page = draft.pages[i];
    const pageSlug = page.slug || toSlug(page.name);
    await tenantQuery(
      schemaName,
      `INSERT INTO _pages (id, app_id, slug, label, description, components, rank)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (app_id, slug) DO NOTHING`,
      [
        uuid(),
        appId,
        pageSlug,
        page.name,
        page.description,
        JSON.stringify(page.components),
        i,
      ]
    );
    pagesCreated++;
  }

  // Create workflows
  for (const workflow of draft.workflows) {
    await tenantQuery(
      schemaName,
      `INSERT INTO _workflows (id, app_id, name, trigger, description, steps)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        uuid(),
        appId,
        workflow.name,
        workflow.trigger,
        workflow.description,
        JSON.stringify(workflow.steps),
      ]
    );
  }

  // Update draft status
  await pgPool.query(
    `UPDATE platform.app_generation_drafts
     SET status = 'published', updated_at = now()
     WHERE id = $1`,
    [draftId]
  );

  void userId; // used for audit trails in future

  return { appId, tablesCreated, pagesCreated };
}
