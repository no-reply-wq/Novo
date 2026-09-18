/**
 * Retroactive migration: adds board_view_enabled / board_group_by_field
 * to form_configs for tenants provisioned before this feature existed.
 *
 * There's no migration runner in this project yet — new columns only
 * ever reached brand-new tenants via tenant-schema.sql, with no way to
 * backfill already-provisioned ones. This is a stopgap pattern (safe,
 * idempotent ALTER TABLE) rather than a real migration system; a
 * proper migration runner tracking which migrations have run per
 * tenant is worth building before this happens many more times.
 *
 * Run once per existing tenant: node -e "require('./migrations/add-board-view-columns').run('tenant_schema_name')"
 * or call runForAllTenants() to sweep every tenant at once.
 */

import { tenantQuery, prisma } from '../client';

export async function run(schemaName: string): Promise<void> {
  await tenantQuery(
    schemaName,
    `ALTER TABLE form_configs
     ADD COLUMN IF NOT EXISTS board_view_enabled BOOLEAN NOT NULL DEFAULT false,
     ADD COLUMN IF NOT EXISTS board_group_by_field TEXT`
  );
}

export async function runForAllTenants(): Promise<{ schema: string; ok: boolean; error?: string }[]> {
  const tenants = await prisma.tenant.findMany({ select: { schemaName: true, slug: true } });
  console.log(`[migration:board-view] Found ${tenants.length} tenant(s):`, tenants.map((t: { slug: string; schemaName: string }) => `${t.slug} -> ${t.schemaName}`));
  const results: { schema: string; ok: boolean; error?: string }[] = [];
  for (const t of tenants) {
    try {
      await run(t.schemaName);
      console.log(`[migration:board-view] ✅ Applied to schema "${t.schemaName}" (tenant: ${t.slug})`);
      results.push({ schema: t.schemaName, ok: true });
    } catch (e) {
      console.error(`[migration:board-view] ❌ Failed for schema "${t.schemaName}" (tenant: ${t.slug}):`, e);
      results.push({ schema: t.schemaName, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
