/**
 * App importer — creates a new app from an AppBundle.
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { AppBundle, ImportOptions, ImportResult } from './types';

type IdMap = Map<string, string>;

function isPool(db: Pool | PoolClient): db is Pool {
  return !('release' in db);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function remapIdsInObject(obj: unknown, idMap: IdMap): unknown {
  if (typeof obj === 'string') return idMap.get(obj) ?? obj;
  if (Array.isArray(obj)) return obj.map(item => remapIdsInObject(item, idMap));
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = remapIdsInObject(val, idMap);
    }
    return result;
  }
  return obj;
}

export async function importApp(
  bundle: AppBundle,
  options: ImportOptions,
  dbOrPool?: Pool | PoolClient,
): Promise<ImportResult> {
  const { pgPool } = await import('@/lib/db/client');

  const ownedClient = !(dbOrPool && !isPool(dbOrPool));
  const useClient: PoolClient = !ownedClient
    ? (dbOrPool as PoolClient)
    : await pgPool.connect();

  const warnings: string[] = [];

  if (options.mergeMode === 'skip') {
    const existing = await useClient.query<{ id: string }>(
      `SELECT id FROM public.apps WHERE slug = $1 AND tenant_slug = $2`,
      [options.newAppSlug ?? bundle.appSlug, options.tenant],
    );
    if ((existing.rowCount ?? 0) > 0) {
      if (ownedClient) useClient.release();
      return {
        appId: existing.rows[0].id,
        appName: options.newAppName ?? bundle.appName,
        tablesCreated: 0,
        pagesCreated: 0,
        workflowsCreated: 0,
        scriptsCreated: 0,
        warnings: ['App already exists; skipped (mergeMode=skip)'],
      };
    }
  }

  try {
    if (ownedClient) await useClient.query('BEGIN');

    if (options.mergeMode === 'replace') {
      const existing = await useClient.query<{ id: string }>(
        `SELECT id FROM public.apps WHERE slug = $1 AND tenant_slug = $2`,
        [options.newAppSlug ?? bundle.appSlug, options.tenant],
      );
      if ((existing.rowCount ?? 0) > 0) {
        const oldId = existing.rows[0].id;
        for (const tbl of [
          'platform.pdf_templates',
          'platform.email_templates',
          'platform.scripts',
          'platform.approval_flows',
          'platform.workflows',
          'platform.pages',
          'platform.table_relations',
          'platform.table_fields',
          'platform.tables',
        ]) {
          await useClient.query(`DELETE FROM ${tbl} WHERE app_id = $1`, [oldId]).catch(() => null);
        }
        await useClient.query(`DELETE FROM public.apps WHERE id = $1`, [oldId]).catch(() => null);
      }
    } else if (options.mergeMode === 'merge') {
      warnings.push('mergeMode=merge: existing records may be duplicated');
    }

    const newAppId = uuidv4();
    const appName = options.newAppName ?? bundle.appName;
    const appSlug = options.newAppSlug ?? bundle.appSlug;

    await useClient.query(
      `INSERT INTO public.apps (id, name, slug, tenant_slug, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [newAppId, appName, appSlug, options.tenant],
    );

    const idMap: IdMap = new Map();

    // Tables
    let tablesCreated = 0;
    for (const table of bundle.schema.tables) {
      if (options.skipExistingTables) {
        const ex = await useClient.query(
          `SELECT id FROM platform.tables WHERE app_id = $1 AND name = $2`,
          [newAppId, table.name],
        );
        if ((ex.rowCount ?? 0) > 0) {
          idMap.set(table._originalId, ex.rows[0].id as string);
          continue;
        }
      }
      const newTableId = uuidv4();
      idMap.set(table._originalId, newTableId);
      await useClient.query(
        `INSERT INTO platform.tables (id, app_id, name, display_name, config, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [newTableId, newAppId, table.name, table.display_name, JSON.stringify(table.config)],
      );
      for (const field of table.fields) {
        const f = field as Record<string, unknown>;
        await useClient.query(
          `INSERT INTO platform.table_fields (id, app_id, table_id, name, field_type, config, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [uuidv4(), newAppId, newTableId, f.name, f.field_type, JSON.stringify(f.config ?? {})],
        ).catch(() => null);
      }
      tablesCreated++;
    }

    // Pages
    let pagesCreated = 0;
    for (const page of bundle.ui.pages) {
      const p = page as Record<string, unknown>;
      const newPageId = uuidv4();
      if (p.id) idMap.set(p.id as string, newPageId);
      const remapped = remapIdsInObject(p, idMap) as Record<string, unknown>;
      await useClient.query(
        `INSERT INTO platform.pages (id, app_id, name, config, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [newPageId, newAppId, remapped.name, JSON.stringify(remapped.config ?? {})],
      );
      pagesCreated++;
    }

    // Workflows
    let workflowsCreated = 0;
    for (const wf of bundle.logic.workflows) {
      const w = wf as Record<string, unknown>;
      const newWfId = uuidv4();
      if (w.id) idMap.set(w.id as string, newWfId);
      const remapped = remapIdsInObject(w, idMap) as Record<string, unknown>;
      await useClient.query(
        `INSERT INTO platform.workflows (id, app_id, name, config, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [newWfId, newAppId, remapped.name, JSON.stringify(remapped.config ?? {})],
      );
      workflowsCreated++;
    }

    // Scripts
    let scriptsCreated = 0;
    for (const script of bundle.scripts) {
      const newScriptId = uuidv4();
      await useClient.query(
        `INSERT INTO platform.scripts (id, app_id, name, code, trigger_type, config, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [newScriptId, newAppId, script.name, script.code, script.trigger_type, JSON.stringify(script.config ?? {})],
      );
      scriptsCreated++;
    }

    // Warn about secrets
    for (const connector of bundle.integrations.restConnectors) {
      if (connector._secretsExcluded) {
        warnings.push(`REST connector "${connector.name}" was exported without secrets — re-enter credentials after import`);
      }
    }

    if (ownedClient) await useClient.query('COMMIT');

    return { appId: newAppId, appName, tablesCreated, pagesCreated, workflowsCreated, scriptsCreated, warnings };
  } catch (err) {
    if (ownedClient) await useClient.query('ROLLBACK');
    throw err;
  } finally {
    if (ownedClient) useClient.release();
  }
}
