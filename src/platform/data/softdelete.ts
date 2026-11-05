/**
 * Soft-delete implementation.
 *
 * Sets deleted_at, deleted_by, delete_reason columns on a record.
 * Provides restore and recycle bin listing.
 *
 * Requirements:
 * - Tables with soft-delete must have columns: deleted_at, deleted_by, delete_reason
 * - See migrations/platform/009_field_sequences.sql (adds these to tenant table template)
 */

import { PoolClient } from 'pg';

export interface SoftDeletedRecord {
  id: string;
  tableName: string;
  deletedAt: Date;
  deletedBy: string;
  deleteReason: string | null;
  data: Record<string, unknown>;
}

/**
 * Soft-delete a record by setting deleted_at, deleted_by, delete_reason.
 *
 * @param tenantSlug  - tenant identifier (schema = "tenant_<slug>")
 * @param tableName   - table API key (snake_case)
 * @param recordId    - UUID of the record
 * @param reason      - deletion reason (may be empty string if not required)
 * @param userId      - UUID of the user performing the delete
 * @param db          - Postgres client
 */
export async function softDelete(
  tenantSlug: string,
  tableName: string,
  recordId: string,
  reason: string,
  userId: string,
  db: PoolClient,
): Promise<void> {
  const schema = pgIdent(`tenant_${tenantSlug}`);
  const table  = pgIdent(tableName);

  const result = await db.query(
    `UPDATE ${schema}.${table}
        SET deleted_at     = NOW(),
            deleted_by     = $1::uuid,
            delete_reason  = $2
      WHERE id = $3::uuid
        AND deleted_at IS NULL`,
    [userId, reason || null, recordId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      `softDelete: record ${recordId} not found or already deleted in ${tenantSlug}.${tableName}`,
    );
  }
}

/**
 * Restore a soft-deleted record (clear deleted_at, deleted_by, delete_reason).
 *
 * @param tenantSlug  - tenant identifier
 * @param tableName   - table API key
 * @param recordId    - UUID of the record to restore
 * @param db          - Postgres client
 */
export async function restoreRecord(
  tenantSlug: string,
  tableName: string,
  recordId: string,
  db: PoolClient,
): Promise<void> {
  const schema = pgIdent(`tenant_${tenantSlug}`);
  const table  = pgIdent(tableName);

  const result = await db.query(
    `UPDATE ${schema}.${table}
        SET deleted_at     = NULL,
            deleted_by     = NULL,
            delete_reason  = NULL
      WHERE id = $1::uuid
        AND deleted_at IS NOT NULL`,
    [recordId],
  );

  if (result.rowCount === 0) {
    throw new Error(
      `restoreRecord: record ${recordId} not found or not deleted in ${tenantSlug}.${tableName}`,
    );
  }
}

/**
 * List records in the recycle bin for a table, sorted by deleted_at desc.
 *
 * @param tenantSlug  - tenant identifier
 * @param tableName   - table API key
 * @param db          - Postgres client
 * @param limit       - max rows to return (default 100)
 * @param offset      - pagination offset
 * @returns           - array of soft-deleted records with metadata
 */
export async function listRecycleBin(
  tenantSlug: string,
  tableName: string,
  db: PoolClient,
  limit = 100,
  offset = 0,
): Promise<SoftDeletedRecord[]> {
  const schema = pgIdent(`tenant_${tenantSlug}`);
  const table  = pgIdent(tableName);

  const res = await db.query<Record<string, unknown>>(
    `SELECT *
       FROM ${schema}.${table}
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return res.rows.map((row: Record<string, unknown>) => ({
    id:           row['id'] as string,
    tableName,
    deletedAt:    row['deleted_at'] as Date,
    deletedBy:    row['deleted_by'] as string,
    deleteReason: (row['delete_reason'] as string | null) ?? null,
    data:         row,
  }));
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}
