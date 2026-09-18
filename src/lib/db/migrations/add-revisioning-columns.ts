/**
 * Retroactive migration: adds revisioning support for tenants
 * provisioned before this feature existed — same pattern as
 * add-board-view-columns.ts. Also backfills thread_id for any existing
 * submissions (thread_id = own id, since they're each their own
 * first revision by definition), since new rows won't have one set
 * until the application code starts doing so going forward.
 */

import { tenantQuery, prisma } from '../client';

export async function run(schemaName: string): Promise<void> {
  await tenantQuery(
    schemaName,
    `ALTER TABLE form_configs
     ADD COLUMN IF NOT EXISTS revisioning_enabled BOOLEAN NOT NULL DEFAULT false`
  );
  await tenantQuery(
    schemaName,
    `ALTER TABLE form_submissions
     ADD COLUMN IF NOT EXISTS thread_id TEXT,
     ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 1,
     ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT true`
  );
  // Backfill: every existing submission is its own first revision.
  await tenantQuery(
    schemaName,
    `UPDATE form_submissions SET thread_id = id WHERE thread_id IS NULL`
  );
}

export async function runForAllTenants(): Promise<{ schema: string; ok: boolean; error?: string }[]> {
  const tenants = await prisma.tenant.findMany({ select: { schemaName: true } });
  const results: { schema: string; ok: boolean; error?: string }[] = [];
  for (const t of tenants) {
    try {
      await run(t.schemaName);
      results.push({ schema: t.schemaName, ok: true });
    } catch (e) {
      results.push({ schema: t.schemaName, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
