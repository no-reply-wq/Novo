import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireSessionTenant, resolveTenantParam } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';

function toApiKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

async function ensureMeta(schemaName: string): Promise<void> {
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
  // Migrate existing _tables that may be missing newer columns (idempotent)
  await tenantQuery(schemaName, `ALTER TABLE _tables ADD COLUMN IF NOT EXISTS rank INT DEFAULT 0`);
  await tenantQuery(schemaName, `ALTER TABLE _tables ADD COLUMN IF NOT EXISTS schema_version INT DEFAULT 1`);
  await tenantQuery(schemaName, `ALTER TABLE _tables ADD COLUMN IF NOT EXISTS soft_delete JSONB`);
  await tenantQuery(schemaName, `ALTER TABLE _tables ADD COLUMN IF NOT EXISTS audit_config JSONB`);
  await tenantQuery(schemaName, `ALTER TABLE _tables ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL DEFAULT ''`).catch(() => {/* already exists */});
  // Add composite unique if slug-only unique exists
  await tenantQuery(schemaName, `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname LIKE '%_tables%app_id%' AND conrelid = '_tables'::regclass
      ) THEN
        BEGIN
          ALTER TABLE _tables DROP CONSTRAINT IF EXISTS _tables_slug_key;
          ALTER TABLE _tables ADD CONSTRAINT _tables_app_id_slug_key UNIQUE (app_id, slug);
        EXCEPTION WHEN others THEN NULL;
        END;
      END IF;
    END $$;
  `).catch(() => {/* ignore constraint errors */});

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
  // Migrate existing _fields
  await tenantQuery(schemaName, `ALTER TABLE _fields ADD COLUMN IF NOT EXISTS lock_when TEXT`);
  await tenantQuery(schemaName, `ALTER TABLE _fields ADD COLUMN IF NOT EXISTS hint TEXT`);
  await tenantQuery(schemaName, `ALTER TABLE _fields ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
}

/** GET /api/builder/apps/[appId]/tables?tenant=... */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params;
  const { searchParams } = new URL(req.url);
  let tenantSlug = resolveTenantParam(searchParams);
  if (!tenantSlug) {
    // No ?tenant= in the URL — fall back to the tenant on the session.
    const sessionCtx = await requireSessionTenant();
    if (sessionCtx instanceof NextResponse) return sessionCtx;
    tenantSlug = sessionCtx.tenant.slug;
  }

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;

  await ensureMeta(ctx.schemaName);

  const result = await tenantQuery(
    ctx.schemaName,
    `SELECT t.*,
            COUNT(DISTINCT f.id) FILTER (WHERE NOT f.is_system) AS field_count
     FROM _tables t
     LEFT JOIN _fields f ON f.table_id = t.id
     WHERE t.app_id = $1
     GROUP BY t.id
     ORDER BY t.rank ASC, t.created_at ASC`,
    [appId]
  );
  return NextResponse.json({ tables: result.rows });
}

/** POST /api/builder/apps/[appId]/tables?tenant=... */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params;
  const { searchParams } = new URL(req.url);
  let tenantSlug = resolveTenantParam(searchParams);
  if (!tenantSlug) {
    // No ?tenant= in the URL — fall back to the tenant on the session.
    const sessionCtx = await requireSessionTenant();
    if (sessionCtx instanceof NextResponse) return sessionCtx;
    tenantSlug = sessionCtx.tenant.slug;
  }

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;

  await ensureMeta(ctx.schemaName);

  const body = (await req.json()) as {
    name?: string;
    apiKey?: string;
    icon?: string;
    color?: string;
    description?: string;
  };
  const { name, apiKey, icon = 'table', color = '#6366f1', description = '' } = body;
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const slug = apiKey ?? toApiKey(name);
  if (!/^[a-z][a-z0-9_]{0,59}$/.test(slug)) {
    return NextResponse.json({ error: 'Invalid apiKey — use lowercase letters, digits, underscores' }, { status: 400 });
  }

  const id = uuidv4();
  const result = await tenantQuery(
    ctx.schemaName,
    `INSERT INTO _tables (id, app_id, slug, label, icon, color, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, appId, slug, name, icon, color, description]
  );
  const table = result.rows[0];

  // Create the physical table
  await tenantQuery(
    ctx.schemaName,
    `CREATE TABLE IF NOT EXISTS ct_${slug} (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`
  );

  // Insert system fields
  await tenantQuery(
    ctx.schemaName,
    `INSERT INTO _fields (table_id, slug, label, type, is_system, field_order)
     VALUES ($1, 'id', 'ID', 'text', true, -3),
            ($1, 'created_at', 'Created At', 'datetime', true, -2),
            ($1, 'updated_at', 'Updated At', 'datetime', true, -1)`,
    [table.id]
  );

  return NextResponse.json({ table }, { status: 201 });
}
