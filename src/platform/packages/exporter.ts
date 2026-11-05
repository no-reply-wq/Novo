/**
 * App package exporter — serializes a complete app config (no data) to JSON.
 */

import { PoolClient } from 'pg';
import type { AppPackage } from './types.js';
import type { AppDefinition, TableDef } from '../contracts/tables.js';
import type { PageDef } from '../contracts/ui.js';
import type { WorkflowDef, ScriptDef } from '../contracts/rules.js';
import type { PdfTemplate } from '../documents/types.js';

interface AppRow {
  id: string;
  tenant_slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface TableRow {
  id: string;
  app_id: string;
  config: TableDef;
}

interface PageRow {
  id: string;
  app_id: string;
  config: PageDef;
}

interface WorkflowRow {
  id: string;
  app_id: string;
  config: WorkflowDef;
}

interface ScriptRow {
  id: string;
  app_id: string;
  name: string;
  description: string | null;
  language: string;
  code: string;
  version: number;
  published_at: Date | null;
  updated_at: Date;
  created_at: Date;
}

interface PdfTemplateRow {
  id: string;
  tenant_slug: string;
  app_id: string;
  name: string;
  table_id: string;
  config: Omit<PdfTemplate, 'id' | 'tenantSlug' | 'name' | 'tableId'>;
}

function semverFromDate(): string {
  const now = new Date();
  return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
}

export async function exportApp(
  tenantSlug: string,
  appId: string,
  db: PoolClient,
): Promise<AppPackage> {
  // Load app row
  const appRes = await db.query<AppRow>(
    `SELECT * FROM public.apps WHERE id = $1 AND tenant_slug = $2`,
    [appId, tenantSlug],
  );
  if (appRes.rowCount === 0) {
    throw new Error(`App ${appId} not found for tenant ${tenantSlug}`);
  }
  const appRow = appRes.rows[0];

  // Load tables
  const tablesRes = await db.query<TableRow>(
    `SELECT id, app_id, config FROM platform.tables WHERE app_id = $1`,
    [appId],
  );
  const tables: TableDef[] = tablesRes.rows.map((r: TableRow) => ({
    ...r.config,
    id: r.id,
    appId: r.app_id,
  }));

  // Load pages
  const pagesRes = await db.query<PageRow>(
    `SELECT id, app_id, config FROM platform.pages WHERE app_id = $1`,
    [appId],
  );
  const pages: PageDef[] = pagesRes.rows.map((r: PageRow) => ({
    ...r.config,
    id: r.id,
    appId: r.app_id,
  }));

  // Load workflows
  const workflowsRes = await db.query<WorkflowRow>(
    `SELECT id, app_id, config FROM platform.workflows WHERE app_id = $1`,
    [appId],
  );
  const workflows: WorkflowDef[] = workflowsRes.rows.map((r: WorkflowRow) => ({
    ...r.config,
    id: r.id,
    appId: r.app_id,
  }));

  // Load scripts
  const scriptsRes = await db.query<ScriptRow>(
    `SELECT id, app_id, name, description, language, code, version, published_at, updated_at, created_at
     FROM platform.scripts WHERE app_id = $1`,
    [appId],
  );
  const scripts: ScriptDef[] = scriptsRes.rows.map((r: ScriptRow) => ({
    id: r.id,
    appId: r.app_id,
    name: r.name,
    description: r.description ?? undefined,
    language: r.language as 'javascript',
    code: r.code,
    version: r.version,
    publishedAt: r.published_at ?? undefined,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }));

  // Load PDF templates
  const templatesRes = await db.query<PdfTemplateRow>(
    `SELECT id, tenant_slug, app_id, name, table_id, config
     FROM platform.pdf_templates WHERE app_id = $1 AND tenant_slug = $2`,
    [appId, tenantSlug],
  );
  const templates: PdfTemplate[] = templatesRes.rows.map((r: PdfTemplateRow) => ({
    ...r.config,
    id: r.id,
    tenantSlug: r.tenant_slug,
    name: r.name,
    tableId: r.table_id,
  }));

  const app: AppDefinition = {
    id: appRow.id,
    tenantId: tenantSlug,
    name: appRow.name,
    slug: appRow.id,
    description: appRow.description ?? undefined,
    iconUrl: appRow.icon ?? undefined,
    version: semverFromDate(),
    status: appRow.published_at ? 'published' : 'draft',
    tables,
    pageIds: pages.map(p => p.id),
    workflowIds: workflows.map(w => w.id),
    scriptIds: scripts.map(s => s.id),
    connectorIds: [],
    docTemplateIds: templates.map(t => t.id),
    environment: 'production',
    createdAt: appRow.created_at,
    updatedAt: appRow.updated_at,
    publishedAt: appRow.published_at ?? undefined,
  };

  return {
    version: semverFromDate(),
    exportedAt: new Date().toISOString(),
    app,
    tables,
    pages,
    workflows,
    scripts,
    templates,
  };
}
