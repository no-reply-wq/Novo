/**
 * Audit log — field-level diff recorded on every write.
 *
 * Writes to public.audit_log (created by migrations/platform/001_…).
 * Reads return AuditEntry[].
 */

import { Pool, PoolClient } from 'pg';

export interface AuditEntry {
  id: number;
  tenantSchema: string;
  tableName: string;
  recordId: string;
  userId: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  diff: Record<string, { before: unknown; after: unknown }>;
  createdAt: Date;
}

/**
 * Writes one audit entry.
 *
 * diff is a map of { fieldApiKey → { before, after } } covering only the
 * fields that changed (or all fields on INSERT/DELETE).
 */
export async function logAudit(
  client: PoolClient,
  tenantSchema: string,
  tableName: string,
  recordId: string,
  userId: string | null,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  diff: Record<string, { before: unknown; after: unknown }>,
): Promise<void> {
  await client.query(
    `INSERT INTO public.audit_log
       (tenant_schema, table_name, record_id, user_id, action, diff)
     VALUES ($1, $2, $3, $4::uuid, $5, $6::jsonb)`,
    [
      tenantSchema,
      tableName,
      recordId,
      userId,
      action,
      JSON.stringify(diff),
    ],
  );
}

/**
 * Returns the full history for one record, newest first.
 */
export async function getRecordHistory(
  pool: Pool,
  tenantSchema: string,
  tableName: string,
  recordId: string,
): Promise<AuditEntry[]> {
  const res = await pool.query<{
    id: number;
    tenant_schema: string;
    table_name: string;
    record_id: string;
    user_id: string | null;
    action: string;
    diff: Record<string, { before: unknown; after: unknown }>;
    created_at: Date;
  }>(
    `SELECT id, tenant_schema, table_name, record_id, user_id, action, diff, created_at
       FROM public.audit_log
      WHERE tenant_schema = $1
        AND table_name    = $2
        AND record_id     = $3::uuid
      ORDER BY created_at DESC`,
    [tenantSchema, tableName, recordId],
  );

  return res.rows.map(r => ({
    id: r.id,
    tenantSchema: r.tenant_schema,
    tableName: r.table_name,
    recordId: r.record_id,
    userId: r.user_id,
    action: r.action as AuditEntry['action'],
    diff: r.diff,
    createdAt: r.created_at,
  }));
}

/**
 * Builds a diff object between an old and new record snapshot.
 * Only includes fields that actually changed.
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const bVal = before[key] ?? null;
    const aVal = after[key] ?? null;
    if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      diff[key] = { before: bVal, after: aVal };
    }
  }

  return diff;
}
