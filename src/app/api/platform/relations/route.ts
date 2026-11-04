import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';

// GET /api/platform/relations?tenant=slug&tableId=xxx&fieldSlug=yyy
// Returns records from related table for use in a relation picker
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const tableId = searchParams.get('tableId');
  const fieldSlug = searchParams.get('fieldSlug');
  const search = searchParams.get('search') ?? '';
  const ids = searchParams.get('ids'); // comma-separated UUIDs to resolve

  if (!tenantSlug || !tableId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.RELATIONS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  // Get the field definition to find related table + display field
  const fieldResult = await tenantQuery(ctx.schemaName,
    `SELECT f.*, t.slug as table_slug FROM _fields f
     JOIN _tables t ON t.id = f.table_id
     WHERE f.table_id = $1 AND f.slug = $2`, [tableId, fieldSlug]);

  if (!fieldResult.rows.length) return NextResponse.json({ error: 'Field not found' }, { status: 404 });
  const field = fieldResult.rows[0];
  const options = field.options as { related_table?: string; display_field?: string; allow_multiple?: boolean };

  if (!options?.related_table) return NextResponse.json({ error: 'No related table configured' }, { status: 400 });

  const relatedSlug = options.related_table;
  const displayField = options.display_field || 'id';

  // Resolve specific IDs (for displaying existing values)
  if (ids) {
    const idList = ids.split(',').filter(Boolean);
    if (!idList.length) return NextResponse.json({ records: [] });
    const result = await tenantQuery(ctx.schemaName,
      `SELECT id, ${displayField}::text as display_value FROM ct_${relatedSlug}
       WHERE id = ANY($1::text[])`, [idList]);
    return NextResponse.json({ records: result.rows });
  }

  // Search for records to show in picker
  let query = `SELECT id, ${displayField}::text as display_value FROM ct_${relatedSlug}`;
  const params: unknown[] = [];
  if (search) {
    query += ` WHERE ${displayField}::text ILIKE $1`;
    params.push(`%${search}%`);
  }
  query += ` ORDER BY ${displayField}::text ASC LIMIT 50`;

  const result = await tenantQuery(ctx.schemaName, query, params);
  return NextResponse.json({
    records: result.rows,
    related_table: relatedSlug,
    display_field: displayField,
    allow_multiple: options.allow_multiple ?? false,
  });
}
