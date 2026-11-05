import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery, pgPool } from '@/lib/db/client';
import { publishApp } from '@/platform/data/schema/publish';
import type { AppDefinition, TableDef } from '@/platform/contracts';
import type { FieldDef, FieldType, FieldOptions } from '@/platform/contracts/fields';
import type { SoftDeleteConfig, AuditConfig } from '@/platform/contracts/tables';

type Params = { appId: string };

interface RawTableRow {
  id: string;
  label: string;
  slug: string;
  icon?: string;
  description?: string;
  soft_delete?: SoftDeleteConfig;
  audit_config?: AuditConfig;
  schema_version?: number;
  created_at: string;
  updated_at: string;
}

interface RawFieldRow {
  id: string;
  label: string;
  slug: string;
  type: string;
  options?: FieldOptions;
  is_required?: boolean;
  is_unique?: boolean;
  default_value?: string;
  lock_when?: string;
  hint?: string;
  field_order?: number;
  created_at: string;
  updated_at: string;
}

/** POST /api/builder/apps/[appId]/publish?tenant=... */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
): Promise<NextResponse> {
  const { appId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;

  // Load all tables for this app
  const tablesRes = await tenantQuery<RawTableRow>(
    ctx.schemaName,
    `SELECT * FROM _tables WHERE app_id = $1 ORDER BY rank ASC`,
    [appId]
  );

  const appTables: TableDef[] = [];
  for (const row of tablesRes.rows) {
    const fieldsRes = await tenantQuery<RawFieldRow>(
      ctx.schemaName,
      `SELECT * FROM _fields WHERE table_id = $1 AND is_system = false ORDER BY field_order ASC`,
      [row.id]
    );

    const fields: FieldDef[] = fieldsRes.rows.map((f) => ({
      id: f.id,
      tableId: row.id,
      name: f.label,
      apiKey: f.slug,
      type: f.type as FieldType,
      options: f.options,
      required: Boolean(f.is_required),
      unique: Boolean(f.is_unique),
      defaultValue: f.default_value,
      lockWhen: f.lock_when,
      hint: f.hint,
      rank: Number(f.field_order ?? 0),
      createdAt: new Date(f.created_at),
      updatedAt: new Date(f.updated_at),
    }));

    appTables.push({
      id: row.id,
      appId,
      name: row.label,
      apiKey: row.slug,
      icon: row.icon,
      description: row.description,
      fields,
      relations: [],
      softDelete: row.soft_delete ?? undefined,
      audit: row.audit_config ?? undefined,
      schemaVersion: Number(row.schema_version ?? 1),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  const appDef: AppDefinition = {
    id: appId,
    tenantId: tenantSlug,
    name: appId,
    slug: appId,
    version: '1.0.0',
    status: 'draft',
    tables: appTables,
    pageIds: [],
    workflowIds: [],
    scriptIds: [],
    connectorIds: [],
    docTemplateIds: [],
    environment: 'development',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await publishApp(pgPool, tenantSlug, appDef);

  // Bump schema version on all tables
  if (tablesRes.rows.length > 0) {
    await tenantQuery(
      ctx.schemaName,
      `UPDATE _tables SET schema_version = schema_version + 1, updated_at = NOW() WHERE app_id = $1`,
      [appId]
    );
  }

  return NextResponse.json({ ok: true, migrations: result.migrations.length, warnings: result.warnings });
}
