/**
 * App exporter — builds an AppBundle from all platform tables.
 */

import { Pool, PoolClient } from 'pg';
import { AppBundle, BundledTable } from './types';

function generateVersion(): string {
  const d = new Date();
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function isPool(db: Pool | PoolClient): db is Pool {
  return !('release' in db);
}

export async function exportApp(
  appId: string,
  tenantSlug: string,
  dbOrPool?: Pool | PoolClient,
  exportedBy?: string,
): Promise<AppBundle> {
  const { pgPool } = await import('@/lib/db/client');
  const pool: Pool = (dbOrPool && isPool(dbOrPool)) ? dbOrPool : pgPool;
  const owned = !(dbOrPool && !isPool(dbOrPool));
  const client: PoolClient = !isPool(pool) ? (dbOrPool as PoolClient) : (owned ? await pool.connect() : dbOrPool as unknown as PoolClient);

  const useClient = (dbOrPool && !isPool(dbOrPool)) ? (dbOrPool as PoolClient) : await pgPool.connect();
  const shouldRelease = !(dbOrPool && !isPool(dbOrPool));

  try {
    const appRes = await useClient.query<{ id: string; name: string; slug: string }>(
      `SELECT id, name, slug FROM public.apps WHERE id = $1 AND tenant_slug = $2`,
      [appId, tenantSlug],
    );
    if (appRes.rowCount === 0) throw new Error(`App not found: ${appId}`);
    const app = appRes.rows[0];

    const [
      tablesRes,
      fieldsRes,
      relationsRes,
      childConfigsRes,
      pagesRes,
      navItemsRes,
      themesRes,
      workflowsRes,
      approvalFlowsRes,
      schedulesRes,
      accessRulesRes,
      fieldPermsRes,
      scriptsRes,
      pdfTemplatesRes,
      emailTemplatesRes,
      stockConfigsRes,
      fulfilmentConfigsRes,
      convertToConfigsRes,
      bomHeadersRes,
      restConnectorsRes,
    ] = await Promise.all([
      useClient.query(`SELECT * FROM platform.tables WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.table_fields WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.table_relations WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.child_table_configs WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.pages WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.nav_items WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.themes WHERE app_id = $1 LIMIT 1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.workflows WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.approval_flows WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.workflow_schedules WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.table_access_rules WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.field_permissions WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.scripts WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.pdf_templates WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.email_templates WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.stock_configs WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.fulfilment_configs WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.convert_to_configs WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(`SELECT * FROM platform.bom_headers WHERE app_id = $1`, [appId]).catch(() => ({ rows: [] })),
      useClient.query(
        `SELECT id, app_id, name, base_url, config FROM platform.rest_connectors WHERE app_id = $1`,
        [appId],
      ).catch(() => ({ rows: [] })),
    ]);

    const tableById = new Map<string, Record<string, unknown>>(
      tablesRes.rows.map((r: Record<string, unknown>) => [r.id as string, r]),
    );

    const tables: BundledTable[] = tablesRes.rows.map((r: Record<string, unknown>) => ({
      _originalId: r.id as string,
      name: r.name as string,
      display_name: r.display_name as string,
      config: (r.config as Record<string, unknown>) ?? {},
      fields: fieldsRes.rows.filter((f: Record<string, unknown>) => f.table_id === r.id),
      relations: relationsRes.rows.filter((rel: Record<string, unknown>) => rel.table_id === r.id),
      childConfigs: childConfigsRes.rows.filter((c: Record<string, unknown>) => c.table_id === r.id),
    }));

    const restConnectors = restConnectorsRes.rows.map((r: Record<string, unknown>) => ({
      ...r,
      _secretsExcluded: true,
    }));

    return {
      bundleVersion: 1,
      exportedAt: new Date().toISOString(),
      exportedBy,
      appId,
      appName: app.name,
      appSlug: app.slug,
      version: generateVersion(),
      schema: { tables },
      ui: {
        pages: pagesRes.rows,
        navItems: navItemsRes.rows,
        theme: themesRes.rows[0] ?? null,
      },
      logic: {
        workflows: workflowsRes.rows,
        approvalFlows: approvalFlowsRes.rows,
        schedules: schedulesRes.rows,
        accessRules: accessRulesRes.rows,
        fieldPermissions: fieldPermsRes.rows,
      },
      scripts: scriptsRes.rows,
      templates: {
        pdf: pdfTemplatesRes.rows,
        email: emailTemplatesRes.rows,
      },
      integrations: {
        stockConfigs: stockConfigsRes.rows,
        fulfilmentConfigs: fulfilmentConfigsRes.rows,
        convertToConfigs: convertToConfigsRes.rows,
        bomHeaders: bomHeadersRes.rows,
        restConnectors,
      },
    };
  } finally {
    if (shouldRelease) useClient.release();
  }
}
