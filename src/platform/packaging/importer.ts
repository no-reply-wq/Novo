/**
 * App bundle importer — imports a versioned AppBundle into a target tenant.
 * Handles table creation, page/workflow/script creation, and ID remapping.
 * Secrets from REST connectors are excluded and reported in warnings.
 */

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import type {
  AppBundle,
  BundledTable,
  BundledScript,
  ImportOptions,
  ImportResult,
} from './types.js';

function uuid(): string {
  return randomUUID();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);
}

type IdMap = Map<string, string>;

function remapId(map: IdMap, id: string): string {
  return map.get(id) ?? id;
}

function remapIdsInObject(obj: unknown, idMap: IdMap): unknown {
  if (typeof obj === 'string') {
    return remapId(idMap, obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => remapIdsInObject(item, idMap));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = remapIdsInObject(value, idMap);
    }
    return result;
  }
  return obj;
}

async function checkSlugUnique(
  client: PoolClient,
  tenantSlug: string,
  slug: string,
): Promise<boolean> {
  const res = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM public.apps WHERE tenant_slug = $1 AND slug = $2`,
    [tenantSlug, slug],
  );
  return parseInt(res.rows[0].count, 10) === 0;
}

export async function importApp(
  bundle: AppBundle,
  options: ImportOptions,
  dbOrPool?: PoolClient | Pool,
): Promise<ImportResult> {
  if (!dbOrPool) {
    throw new Error('A database client or pool must be provided to importApp');
  }

  const isPool = !('release' in dbOrPool);
  const client: PoolClient = isPool
    ? await (dbOrPool as Pool).connect()
    : (dbOrPool as PoolClient);

  const warnings: string[] = [];

  try {
    const inTransaction = !isPool;
    if (!inTransaction) {
      await client.query('BEGIN');
    }

    const { targetTenantSlug, newAppName, newAppSlug, skipExistingTables, mergeMode } = options;

    const appName = newAppName ?? bundle.app.name;
    const appSlug = newAppSlug ?? slugify(appName);

    // ── Check for existing app ────────────────────────────────────────────────
    const existingRes = await client.query<{ id: string }>(
      `SELECT id FROM public.apps WHERE tenant_slug = $1 AND (name = $2 OR slug = $3) LIMIT 1`,
      [targetTenantSlug, appName, appSlug],
    );

    if ((existingRes.rowCount ?? 0) > 0) {
      if (mergeMode === 'skip') {
        // Return with 0 counts; nothing imported
        return { appId: existingRes.rows[0].id, tablesCreated: 0, pagesCreated: 0, workflowsCreated: 0, scriptsCreated: 0, warnings: ['App already exists; skipped (mergeMode=skip)'] };
      }
      if (mergeMode === 'replace') {
        const existingId = existingRes.rows[0].id;
        // Delete existing app children
        for (const table of [
          'platform.pdf_templates',
          'platform.scripts',
          'platform.approval_flows',
          'platform.workflows',
          'platform.pages',
          'platform.table_relations',
          'platform.tables',
        ]) {
          await client.query(`DELETE FROM ${table} WHERE app_id = $1`, [existingId]);
        }
        await client.query(`DELETE FROM public.apps WHERE id = $1`, [existingId]);
      } else {
        // mergeMode === 'merge': keep existing, only add new
        warnings.push(`App "${appName}" already exists; merging new items only`);
      }
    } else {
      // Slug uniqueness check
      const slugAvailable = await checkSlugUnique(client, targetTenantSlug, appSlug);
      if (!slugAvailable) {
        throw new Error(`Slug "${appSlug}" is already taken in tenant "${targetTenantSlug}"`);
      }
    }

    // ── Build ID map ──────────────────────────────────────────────────────────
    const idMap: IdMap = new Map();
    const newAppId = uuid();

    // Map all old entity IDs to new UUIDs
    for (const table of bundle.schema.tables) {
      const oldId = (table as { _originalId?: string })._originalId ?? table.slug;
      idMap.set(oldId, uuid());
    }
    for (const page of bundle.ui.pages) {
      const p = page as { id?: string };
      if (p.id) idMap.set(p.id, uuid());
    }
    for (const wf of bundle.logic.workflows) {
      const w = wf as { id?: string };
      if (w.id) idMap.set(w.id, uuid());
    }
    for (const af of bundle.logic.approvalFlows) {
      const a = af as { id?: string };
      if (a.id) idMap.set(a.id, uuid());
    }

    // ── Create app ────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO public.apps (id, tenant_slug, name, slug, description, icon)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [newAppId, targetTenantSlug, appName, appSlug, bundle.app.description ?? null, bundle.app.icon ?? null],
    );

    // ── Create tables ─────────────────────────────────────────────────────────
    let tablesCreated = 0;
    for (const table of bundle.schema.tables as BundledTable[]) {
      const oldId = (table as { _originalId?: string })._originalId ?? table.slug;
      const newTableId = idMap.get(oldId) ?? uuid();

      if (skipExistingTables) {
        const exists = await client.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM platform.tables WHERE app_id = $1 AND config->>'slug' = $2`,
          [newAppId, table.slug],
        );
        if (parseInt(exists.rows[0].count, 10) > 0) {
          warnings.push(`Table "${table.slug}" already exists; skipped`);
          continue;
        }
      }

      const tableConfig = {
        ...table,
        id: newTableId,
        appId: newAppId,
        fields: Array.isArray(table.fields) ? table.fields : [],
        indexes: Array.isArray(table.indexes) ? table.indexes : [],
      };

      await client.query(
        `INSERT INTO platform.tables (id, app_id, config)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
        [newTableId, newAppId, JSON.stringify(tableConfig)],
      );
      tablesCreated++;
    }

    // ── Create pages ──────────────────────────────────────────────────────────
    let pagesCreated = 0;
    for (const page of bundle.ui.pages) {
      const p = page as { id?: string; slug?: string; [key: string]: unknown };
      const oldId = p.id ?? uuid();
      const newPageId = idMap.get(oldId) ?? uuid();
      const remapped = remapIdsInObject({ ...p, id: newPageId, appId: newAppId }, idMap);

      await client.query(
        `INSERT INTO platform.pages (id, app_id, slug, config)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
        [newPageId, newAppId, p.slug ?? null, JSON.stringify(remapped)],
      ).catch(() => {
        // pages table may not have slug column; retry without
        return client.query(
          `INSERT INTO platform.pages (id, app_id, config)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
          [newPageId, newAppId, JSON.stringify(remapped)],
        );
      });
      pagesCreated++;
    }

    // ── Create workflows ──────────────────────────────────────────────────────
    let workflowsCreated = 0;
    for (const wf of bundle.logic.workflows) {
      const w = wf as { id?: string; [key: string]: unknown };
      const oldId = w.id ?? uuid();
      const newWfId = idMap.get(oldId) ?? uuid();
      const remapped = remapIdsInObject({ ...w, id: newWfId, appId: newAppId }, idMap);

      await client.query(
        `INSERT INTO platform.workflows (id, app_id, config)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
        [newWfId, newAppId, JSON.stringify(remapped)],
      ).catch(() => { /* ignore if table schema differs */ });
      workflowsCreated++;
    }

    // ── Create approval flows ─────────────────────────────────────────────────
    for (const af of bundle.logic.approvalFlows) {
      const a = af as { id?: string; [key: string]: unknown };
      const oldId = a.id ?? uuid();
      const newAfId = idMap.get(oldId) ?? uuid();
      const remapped = remapIdsInObject({ ...a, id: newAfId, appId: newAppId }, idMap);

      await client.query(
        `INSERT INTO platform.approval_flows (id, app_id, config)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
        [newAfId, newAppId, JSON.stringify(remapped)],
      ).catch(() => { /* ignore if table schema differs */ });
    }

    // ── Create scripts ────────────────────────────────────────────────────────
    let scriptsCreated = 0;
    for (const script of bundle.scripts as BundledScript[]) {
      const scriptId = uuid();
      await client.query(
        `INSERT INTO platform.scripts (id, app_id, name, code, input_schema, output_schema, test_cases)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          scriptId,
          newAppId,
          script.name,
          script.code,
          JSON.stringify(script.inputSchema),
          JSON.stringify(script.outputSchema),
          JSON.stringify(script.testCases),
        ],
      ).catch(() => {
        // Fallback: insert without optional columns
        return client.query(
          `INSERT INTO platform.scripts (id, app_id, name, code)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [scriptId, newAppId, script.name, script.code],
        );
      });
      scriptsCreated++;
    }

    // ── Warn about REST connector secrets ─────────────────────────────────────
    for (const connector of bundle.integrations.restConnectors) {
      const c = connector as { name?: string; _secretsExcluded?: boolean };
      if (c._secretsExcluded) {
        warnings.push(`Secret credentials for connector "${c.name ?? 'unknown'}" were not imported — re-enter them manually`);
      }
    }

    // ── PDF templates ─────────────────────────────────────────────────────────
    for (const tmpl of bundle.integrations.pdfTemplates) {
      const t = tmpl as { id?: string; name?: string; [key: string]: unknown };
      const tmplId = uuid();
      await client.query(
        `INSERT INTO platform.pdf_templates (id, tenant_slug, app_id, name, config)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [tmplId, targetTenantSlug, newAppId, t.name ?? 'Template', JSON.stringify(t)],
      ).catch(() => { /* ignore schema differences */ });
    }

    if (!inTransaction) {
      await client.query('COMMIT');
    }

    return {
      appId: newAppId,
      tablesCreated,
      pagesCreated,
      workflowsCreated,
      scriptsCreated,
      warnings,
    };
  } catch (err) {
    if (!isPool) {
      await client.query('ROLLBACK').catch(() => { /* best effort */ });
    }
    throw err;
  } finally {
    if (isPool) {
      (client as PoolClient).release();
    }
  }
}
