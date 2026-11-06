/**
 * App bundle exporter — serializes a complete app (tables, pages, workflows,
 * scripts, rules, templates, integrations) as a versioned AppBundle.
 * Secrets are excluded; only connector config (key names) is included.
 */

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import semver from 'semver';
import type {
  AppBundle,
  BundledTable,
  BundledScript,
} from './types.js';

function generateVersion(): string {
  const now = new Date();
  const major = now.getFullYear();
  const minor = now.getMonth() + 1;
  const patch = now.getDate();
  const base = `${major}.${minor}.${patch}`;
  // Validate and normalize
  return semver.valid(semver.coerce(base)) ?? '1.0.0';
}

interface AppRow {
  id: string;
  tenant_slug: string;
  name: string;
  slug: string | null;
  description: string | null;
  icon: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TableRow {
  id: string;
  app_id: string;
  config: {
    slug?: string;
    name?: string;
    fields?: unknown[];
    indexes?: unknown[];
    [key: string]: unknown;
  };
}

interface RelationRow {
  id: string;
  app_id: string;
  config: unknown;
}

interface ChildTableConfigRow {
  id: string;
  parent_table_id: string;
  config: unknown;
}

interface PageRow {
  id: string;
  app_id: string;
  config: unknown;
  slug: string | null;
}

interface NavItemRow {
  id: string;
  app_id: string;
  config: unknown;
}

interface WorkflowRow {
  id: string;
  app_id: string;
  config: unknown;
}

interface ApprovalFlowRow {
  id: string;
  app_id: string;
  config: unknown;
}

interface ScheduleRow {
  id: string;
  workflow_id: string;
  config: unknown;
}

interface AccessRuleRow {
  id: string;
  table_id: string;
  config: unknown;
}

interface FieldPermissionRow {
  id: string;
  table_id: string;
  config: unknown;
}

interface ScriptRow {
  id: string;
  app_id: string;
  name: string;
  code: string;
  input_schema: unknown[] | null;
  output_schema: unknown[] | null;
  test_cases: unknown[] | null;
}

interface PdfTemplateRow {
  id: string;
  app_id: string;
  name: string;
  config: unknown;
}

interface EmailTemplateRow {
  id: string;
  app_id: string;
  config: unknown;
}

interface StockConfigRow {
  id: string;
  app_id: string;
  config: unknown;
}

interface FulfilmentConfigRow {
  id: string;
  app_id: string;
  config: unknown;
}

interface ConvertToConfigRow {
  id: string;
  app_id: string;
  config: unknown;
}

interface BomHeaderRow {
  id: string;
  app_id: string;
  config: unknown;
}

interface RestConnectorRow {
  id: string;
  app_id: string;
  name: string;
  base_url: string | null;
  // secrets (api_key etc.) are intentionally excluded from SELECT
  config: unknown;
}

export async function exportApp(
  appId: string,
  tenantSlug: string,
  dbOrPool?: PoolClient | Pool,
  exportedBy = 'system',
): Promise<AppBundle> {
  if (!dbOrPool) {
    throw new Error('A database client or pool must be provided to exportApp');
  }

  const isPool = !('release' in dbOrPool);
  const client: PoolClient = isPool
    ? await (dbOrPool as Pool).connect()
    : (dbOrPool as PoolClient);

  try {
    // ── App row ──────────────────────────────────────────────────────────────
    const appRes = await client.query<AppRow>(
      `SELECT id, tenant_slug, name, slug, description, icon, created_at, updated_at
       FROM public.apps
       WHERE id = $1 AND tenant_slug = $2`,
      [appId, tenantSlug],
    );
    if ((appRes.rowCount ?? 0) === 0) {
      throw new Error(`App ${appId} not found for tenant ${tenantSlug}`);
    }
    const app = appRes.rows[0];

    // ── Tables ───────────────────────────────────────────────────────────────
    const tablesRes = await client.query<TableRow>(
      `SELECT id, app_id, config FROM platform.tables WHERE app_id = $1`,
      [appId],
    );
    const tables: BundledTable[] = tablesRes.rows.map((r: TableRow) => ({
      slug: r.config.slug ?? r.id,
      name: r.config.name ?? 'Unnamed',
      fields: Array.isArray(r.config.fields) ? r.config.fields : [],
      indexes: Array.isArray(r.config.indexes) ? r.config.indexes : [],
      _originalId: r.id,
      ...r.config,
    }));

    // ── Relations ─────────────────────────────────────────────────────────────
    const relRes = await client.query<RelationRow>(
      `SELECT id, app_id, config FROM platform.table_relations WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));

    // ── Child table configs ───────────────────────────────────────────────────
    const childTableIds = tablesRes.rows.map(r => r.id);
    let childTableConfigs: unknown[] = [];
    if (childTableIds.length > 0) {
      const ctRes = await client.query<ChildTableConfigRow>(
        `SELECT id, parent_table_id, config
         FROM platform.child_table_configs
         WHERE parent_table_id = ANY($1::uuid[])`,
        [childTableIds],
      ).catch(() => ({ rows: [] }));
      childTableConfigs = ctRes.rows.map(r => ({ id: r.id, parentTableId: r.parent_table_id, ...((r.config as object) ?? {}) }));
    }

    // ── Pages ────────────────────────────────────────────────────────────────
    const pagesRes = await client.query<PageRow>(
      `SELECT id, app_id, config, slug FROM platform.pages WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));

    // ── Nav items ─────────────────────────────────────────────────────────────
    const navRes = await client.query<NavItemRow>(
      `SELECT id, app_id, config FROM platform.nav_items WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));

    // ── Theme ─────────────────────────────────────────────────────────────────
    const themeRes = await client.query<{ config: unknown }>(
      `SELECT config FROM platform.themes WHERE app_id = $1 LIMIT 1`,
      [appId],
    ).catch(() => ({ rows: [] }));
    const theme = themeRes.rows[0]?.config ?? null;

    // ── Workflows ─────────────────────────────────────────────────────────────
    const workflowRes = await client.query<WorkflowRow>(
      `SELECT id, app_id, config FROM platform.workflows WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));
    const workflowIds = workflowRes.rows.map(r => r.id);

    // ── Approval flows ────────────────────────────────────────────────────────
    const approvalRes = await client.query<ApprovalFlowRow>(
      `SELECT id, app_id, config FROM platform.approval_flows WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));

    // ── Schedules ─────────────────────────────────────────────────────────────
    let schedules: unknown[] = [];
    if (workflowIds.length > 0) {
      const schedRes = await client.query<ScheduleRow>(
        `SELECT id, workflow_id, config
         FROM platform.workflow_schedules
         WHERE workflow_id = ANY($1::uuid[])`,
        [workflowIds],
      ).catch(() => ({ rows: [] }));
      schedules = schedRes.rows.map(r => ({ id: r.id, workflowId: r.workflow_id, ...((r.config as object) ?? {}) }));
    }

    // ── Access rules ──────────────────────────────────────────────────────────
    let accessRules: unknown[] = [];
    let fieldPermissions: unknown[] = [];
    if (childTableIds.length > 0) {
      const arRes = await client.query<AccessRuleRow>(
        `SELECT id, table_id, config
         FROM platform.table_access_rules
         WHERE table_id = ANY($1::uuid[])`,
        [childTableIds],
      ).catch(() => ({ rows: [] }));
      accessRules = arRes.rows.map(r => ({ id: r.id, tableId: r.table_id, ...((r.config as object) ?? {}) }));

      const fpRes = await client.query<FieldPermissionRow>(
        `SELECT id, table_id, config
         FROM platform.field_permissions
         WHERE table_id = ANY($1::uuid[])`,
        [childTableIds],
      ).catch(() => ({ rows: [] }));
      fieldPermissions = fpRes.rows.map(r => ({ id: r.id, tableId: r.table_id, ...((r.config as object) ?? {}) }));
    }

    // ── Scripts ───────────────────────────────────────────────────────────────
    const scriptRes = await client.query<ScriptRow>(
      `SELECT id, app_id, name, code, input_schema, output_schema, test_cases
       FROM platform.scripts WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));
    const scripts: BundledScript[] = scriptRes.rows.map((r: ScriptRow) => ({
      name: r.name,
      code: r.code,
      inputSchema: r.input_schema ?? [],
      outputSchema: r.output_schema ?? [],
      testCases: r.test_cases ?? [],
    }));

    // ── PDF templates ─────────────────────────────────────────────────────────
    const pdfRes = await client.query<PdfTemplateRow>(
      `SELECT id, app_id, name, config
       FROM platform.pdf_templates
       WHERE app_id = $1 AND tenant_slug = $2`,
      [appId, tenantSlug],
    ).catch(() => ({ rows: [] }));

    // ── Email templates ───────────────────────────────────────────────────────
    const emailRes = await client.query<EmailTemplateRow>(
      `SELECT id, app_id, config
       FROM platform.email_templates
       WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));

    // ── Stock configs ─────────────────────────────────────────────────────────
    const stockRes = await client.query<StockConfigRow>(
      `SELECT id, app_id, config
       FROM platform.stock_configs
       WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));

    // ── Fulfilment configs ────────────────────────────────────────────────────
    const fulfilRes = await client.query<FulfilmentConfigRow>(
      `SELECT id, app_id, config
       FROM platform.fulfilment_configs
       WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));

    // ── Convert-to configs ────────────────────────────────────────────────────
    const convertRes = await client.query<ConvertToConfigRow>(
      `SELECT id, app_id, config
       FROM platform.convert_to_configs
       WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));

    // ── BOM headers ───────────────────────────────────────────────────────────
    const bomRes = await client.query<BomHeaderRow>(
      `SELECT id, app_id, config
       FROM platform.bom_headers
       WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));

    // ── REST connectors (config only, secrets excluded) ───────────────────────
    const connectorRes = await client.query<RestConnectorRow>(
      `SELECT id, app_id, name, base_url, config
       FROM platform.rest_connectors
       WHERE app_id = $1`,
      [appId],
    ).catch(() => ({ rows: [] }));
    const restConnectors = connectorRes.rows.map((r: RestConnectorRow) => ({
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      // config may contain key names but values are excluded server-side
      config: r.config,
      _secretsExcluded: true,
    }));

    return {
      version: generateVersion(),
      exportedAt: new Date().toISOString(),
      exportedBy,
      app: {
        name: app.name,
        slug: app.slug ?? app.id,
        icon: app.icon ?? undefined,
        description: app.description ?? undefined,
      },
      schema: {
        tables,
        relations: relRes.rows.map(r => ({ id: r.id, ...((r.config as object) ?? {}) })),
        childTableConfigs,
      },
      ui: {
        pages: pagesRes.rows.map(r => ({ id: r.id, slug: r.slug, ...((r.config as object) ?? {}) })),
        navItems: navRes.rows.map(r => ({ id: r.id, ...((r.config as object) ?? {}) })),
        theme: theme ?? undefined,
      },
      logic: {
        workflows: workflowRes.rows.map(r => ({ id: r.id, ...((r.config as object) ?? {}) })),
        approvalFlows: approvalRes.rows.map(r => ({ id: r.id, ...((r.config as object) ?? {}) })),
        schedules,
        accessRules,
        fieldPermissions,
      },
      scripts,
      integrations: {
        pdfTemplates: pdfRes.rows.map(r => ({ id: r.id, name: r.name, ...((r.config as object) ?? {}) })),
        emailTemplates: emailRes.rows.map(r => ({ id: r.id, ...((r.config as object) ?? {}) })),
        stockConfigs: stockRes.rows.map(r => ({ id: r.id, ...((r.config as object) ?? {}) })),
        fulfilmentConfigs: fulfilRes.rows.map(r => ({ id: r.id, ...((r.config as object) ?? {}) })),
        convertToConfigs: convertRes.rows.map(r => ({ id: r.id, ...((r.config as object) ?? {}) })),
        bomHeaders: bomRes.rows.map(r => ({ id: r.id, ...((r.config as object) ?? {}) })),
        restConnectors,
      },
    };
  } finally {
    if (isPool) {
      (client as PoolClient).release();
    }
  }
}

// Re-export for convenience
export { generateVersion };
export { randomUUID as newId };
