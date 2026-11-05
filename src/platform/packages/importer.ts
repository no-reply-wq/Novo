/**
 * App package importer — imports a package into a target tenant.
 */

import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import type { AppPackage, ImportResult } from './types.js';

function uuid(): string {
  return randomUUID();
}
import type { TableDef } from '../contracts/tables.js';
import type { PageDef } from '../contracts/ui.js';
import type { WorkflowDef, ScriptDef } from '../contracts/rules.js';
import type { PdfTemplate } from '../documents/types.js';

interface ImportOptions {
  overwrite: boolean;
  newAppName?: string;
}

export async function importApp(
  targetTenantSlug: string,
  pkg: AppPackage,
  options: ImportOptions,
  db: PoolClient,
): Promise<ImportResult> {
  const warnings: string[] = [];
  const newAppId = uuid();

  const appName = options.newAppName ?? pkg.app.name;

  // Check if an app with the same name already exists
  const existingRes = await db.query<{ id: string }>(
    `SELECT id FROM public.apps WHERE tenant_slug = $1 AND name = $2`,
    [targetTenantSlug, appName],
  );

  if (existingRes.rowCount > 0 && !options.overwrite) {
    throw new Error(
      `App "${appName}" already exists in tenant "${targetTenantSlug}". ` +
      'Use overwrite: true to replace it.',
    );
  }

  // If overwrite, delete the existing app and its children
  if (existingRes.rowCount > 0 && options.overwrite) {
    const existingAppId = existingRes.rows[0].id;
    await db.query(`DELETE FROM platform.pdf_templates WHERE app_id = $1 AND tenant_slug = $2`, [existingAppId, targetTenantSlug]);
    await db.query(`DELETE FROM platform.scripts WHERE app_id = $1`, [existingAppId]);
    await db.query(`DELETE FROM platform.workflows WHERE app_id = $1`, [existingAppId]);
    await db.query(`DELETE FROM platform.pages WHERE app_id = $1`, [existingAppId]);
    await db.query(`DELETE FROM platform.tables WHERE app_id = $1`, [existingAppId]);
    await db.query(`DELETE FROM public.apps WHERE id = $1`, [existingAppId]);
  }

  // ID remapping: old IDs → new IDs
  const idMap = new Map<string, string>();
  idMap.set(pkg.app.id, newAppId);

  for (const table of pkg.tables) {
    idMap.set(table.id, uuid());
  }
  for (const page of pkg.pages) {
    idMap.set(page.id, uuid());
  }
  for (const workflow of pkg.workflows) {
    idMap.set(workflow.id, uuid());
  }
  for (const script of pkg.scripts) {
    idMap.set(script.id, uuid());
  }
  for (const template of pkg.templates) {
    idMap.set(template.id, uuid());
  }

  function remapId(id: string): string {
    return idMap.get(id) ?? id;
  }

  // Insert app
  await db.query(
    `INSERT INTO public.apps (id, tenant_slug, name, description, icon, color)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [newAppId, targetTenantSlug, appName, pkg.app.description ?? null, pkg.app.iconUrl ?? null, null],
  );

  // Insert tables
  for (const table of pkg.tables) {
    const newTableId = remapId(table.id);
    const remapped: TableDef = { ...table, id: newTableId, appId: newAppId };
    await db.query(
      `INSERT INTO platform.tables (id, app_id, config) VALUES ($1, $2, $3)`,
      [newTableId, newAppId, JSON.stringify(remapped)],
    );
  }

  // Insert pages
  for (const page of pkg.pages) {
    const newPageId = remapId(page.id);
    const remapped: PageDef = { ...page, id: newPageId, appId: newAppId };
    await db.query(
      `INSERT INTO platform.pages (id, app_id, config) VALUES ($1, $2, $3)`,
      [newPageId, newAppId, JSON.stringify(remapped)],
    );
  }

  // Insert workflows
  for (const workflow of pkg.workflows) {
    const newWorkflowId = remapId(workflow.id);
    const remapped: WorkflowDef = { ...workflow, id: newWorkflowId, appId: newAppId };
    await db.query(
      `INSERT INTO platform.workflows (id, app_id, config) VALUES ($1, $2, $3)`,
      [newWorkflowId, newAppId, JSON.stringify(remapped)],
    );
  }

  // Insert scripts
  for (const script of pkg.scripts) {
    const newScriptId = remapId(script.id);
    await db.query(
      `INSERT INTO platform.scripts (id, app_id, name, description, language, code, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newScriptId,
        newAppId,
        script.name,
        script.description ?? null,
        script.language,
        script.code,
        script.version,
      ],
    );
    // Warn if script references secrets that may not exist
    if (script.code.includes('secrets.get(')) {
      warnings.push(
        `Script "${script.name}" uses secrets.get() — make sure secrets are configured in Integrations.`,
      );
    }
    // Warn if script uses http.fetch
    if (script.code.includes('http.fetch(')) {
      warnings.push(
        `Script "${script.name}" uses http.fetch() — make sure the target URLs are in the tenant's allowlist.`,
      );
    }
  }

  // Insert PDF templates
  for (const template of pkg.templates) {
    const newTemplateId = remapId(template.id);
    const { id: _id, tenantSlug: _tenantSlug, name, tableId, ...config } = template;
    const remapped: PdfTemplate = {
      ...template,
      id: newTemplateId,
      tenantSlug: targetTenantSlug,
    };
    await db.query(
      `INSERT INTO platform.pdf_templates (id, tenant_slug, app_id, name, table_id, config)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        newTemplateId,
        targetTenantSlug,
        newAppId,
        name,
        tableId,
        JSON.stringify({ ...config, id: newTemplateId, tenantSlug: targetTenantSlug }),
      ],
    );
    void remapped; // used for type-check completeness
  }

  return { appId: newAppId, warnings };
}
