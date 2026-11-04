/**
 * Schema drift detector — compares the tenant's live Postgres schema against
 * the expected column set stored in _fields.
 *
 * Called fire-and-forget on the dashboard (.catch(() => {})) so it never
 * blocks the page render.
 */
import { tenantQuery } from '@/lib/db/client';

export interface SchemaDriftResult {
  missingColumns: Array<{ table: string; column: string; expectedType: string }>;
  extraColumns:   Array<{ table: string; column: string }>;
}

/**
 * Returns columns that are in _fields but missing from the live table,
 * and columns that exist in the live table but are not in _fields.
 *
 * Only inspects tables prefixed with `ct_`.
 */
export async function checkSchemaDrift(schemaName: string): Promise<SchemaDriftResult> {
  // Columns declared in the field registry
  const declared = await tenantQuery<{ table_slug: string; slug: string; type: string }>(
    schemaName,
    `SELECT t.slug AS table_slug, f.slug, f.type
     FROM _fields f
     JOIN _tables t ON t.id = f.table_id
     ORDER BY t.slug, f.slug`
  );

  // Live columns in ct_* tables
  const live = await tenantQuery<{ table_name: string; column_name: string }>(
    schemaName,
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name LIKE 'ct_%'
     ORDER BY table_name, column_name`,
    [schemaName]
  );

  const liveSet = new Set(live.rows.map(r => `${r.table_name}.${r.column_name}`));
  const declaredSet = new Set(declared.rows.map(r => `ct_${r.table_slug}.${r.slug}`));

  const missingColumns = declared.rows
    .filter(r => !liveSet.has(`ct_${r.table_slug}.${r.slug}`))
    .map(r => ({ table: `ct_${r.table_slug}`, column: r.slug, expectedType: r.type }));

  const extraColumns = live.rows
    .filter(r => !declaredSet.has(`${r.table_name}.${r.column_name}`)
      && !['id','created_at','updated_at','created_by','updated_by'].includes(r.column_name))
    .map(r => ({ table: r.table_name, column: r.column_name }));

  if (missingColumns.length || extraColumns.length) {
    console.warn('[schema-check] drift detected', { missingColumns, extraColumns });
  }

  return { missingColumns, extraColumns };
}
