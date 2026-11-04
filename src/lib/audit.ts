/**
 * Audit log helper — writes a row to the tenant's audit_logs table.
 * Called fire-and-forget (.catch(() => {})) so failures never break the main flow.
 */
import { tenantQuery } from '@/lib/db/client';
import { v4 as uuid } from 'uuid';

export async function writeAudit(
  schemaName: string,
  userId: string | null | undefined,
  action: string,
  entityType: string,
  entityId: string,
  diff?: Record<string, unknown>
): Promise<void> {
  await tenantQuery(
    schemaName,
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, diff, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT DO NOTHING`,
    [uuid(), userId ?? null, action, entityType, entityId, JSON.stringify(diff ?? {})]
  );
}
