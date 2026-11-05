import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';
import type { FieldType } from '@/platform/contracts/fields';

type Params = { appId: string; tableId: string };

const PG_TYPE_MAP: Record<string, string> = {
  text: 'TEXT',
  long_text: 'TEXT',
  rich_text: 'TEXT',
  email: 'TEXT',
  phone: 'TEXT',
  url: 'TEXT',
  password: 'TEXT',
  integer: 'BIGINT',
  decimal: 'NUMERIC(18,4)',
  currency: 'NUMERIC(18,2)',
  percent: 'NUMERIC(8,4)',
  quantity: 'NUMERIC(18,4)',
  boolean: 'BOOLEAN DEFAULT false',
  date: 'DATE',
  time: 'TIME',
  datetime: 'TIMESTAMPTZ',
  date_range: 'JSONB',
  duration: 'BIGINT',
  dropdown: 'TEXT',
  multi_select: 'TEXT[]',
  radio: 'TEXT',
  checkbox: 'TEXT[]',
  rating: 'INT',
  color: 'TEXT',
  lookup: 'TEXT',
  user: 'TEXT',
  location: 'TEXT',
  file: 'JSONB DEFAULT \'[]\'',
  image: 'JSONB DEFAULT \'[]\'',
  signature: 'TEXT',
  barcode: 'TEXT',
  gps: 'JSONB',
  json: 'JSONB DEFAULT \'{}\'',
  formula: 'TEXT GENERATED ALWAYS AS (NULL) STORED',
  rollup: 'TEXT',
  lookup_value: 'TEXT',
  auto_number: 'TEXT',
  status_from_rules: 'TEXT',
};

/** POST /api/builder/apps/[appId]/tables/[tableId]/fields?tenant=... */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
): Promise<NextResponse> {
  const { tableId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, MODULE.FIELDS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json()) as {
    name?: string;
    apiKey?: string;
    type?: FieldType;
    options?: Record<string, unknown>;
    required?: boolean;
    unique?: boolean;
    defaultValue?: unknown;
    lockWhen?: string;
    hint?: string;
  };

  const { name, apiKey, type = 'text', options = {}, required = false, unique = false, defaultValue, lockWhen, hint } = body;
  if (!name || !apiKey) return NextResponse.json({ error: 'name and apiKey are required' }, { status: 400 });
  if (!/^[a-z][a-z0-9_]{0,59}$/.test(apiKey)) {
    return NextResponse.json({ error: 'Invalid apiKey — use lowercase letters, digits, underscores' }, { status: 400 });
  }

  const tableMeta = await tenantQuery(ctx.schemaName, `SELECT slug FROM _tables WHERE id = $1`, [tableId]);
  if (!tableMeta.rows.length) return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  const { slug: tableSlug } = tableMeta.rows[0] as { slug: string };

  // Computed fields don't have real columns
  const computedTypes = new Set(['formula', 'rollup', 'lookup_value', 'auto_number', 'status_from_rules']);
  if (!computedTypes.has(type)) {
    const pgType = PG_TYPE_MAP[type] ?? 'TEXT';
    const notNull = required && !pgType.includes('DEFAULT') ? "NOT NULL DEFAULT ''" : '';
    try {
      await tenantQuery(
        ctx.schemaName,
        `ALTER TABLE ct_${tableSlug} ADD COLUMN IF NOT EXISTS ${apiKey} ${pgType} ${notNull}`
      );
      if (unique) {
        await tenantQuery(
          ctx.schemaName,
          `CREATE UNIQUE INDEX IF NOT EXISTS ct_${tableSlug}_${apiKey}_uq ON ct_${tableSlug}(${apiKey})`
        );
      }
    } catch (err) {
      return NextResponse.json({ error: `Failed to add column: ${(err as Error).message}` }, { status: 400 });
    }
  }

  const countRes = await tenantQuery<{ c: string }>(
    ctx.schemaName,
    `SELECT COUNT(*) AS c FROM _fields WHERE table_id = $1`,
    [tableId]
  );
  const rank = parseInt(countRes.rows[0].c);

  const id = uuidv4();
  const result = await tenantQuery(
    ctx.schemaName,
    `INSERT INTO _fields
       (id, table_id, slug, label, type, options, is_required, is_unique, default_value, lock_when, hint, field_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      id,
      tableId,
      apiKey,
      name,
      type,
      JSON.stringify(options),
      required,
      unique,
      defaultValue !== undefined ? String(defaultValue) : null,
      lockWhen ?? null,
      hint ?? null,
      rank,
    ]
  );

  return NextResponse.json({ field: result.rows[0] }, { status: 201 });
}
