/**
 * Record version snapshots.
 *
 * Stores full JSON snapshots in public.record_versions.
 * Supports named versions (R0, R1, …) for explicit version labelling.
 * See migrations/platform/010_record_versions.sql.
 */

import { PoolClient } from 'pg';

export interface RecordVersion {
  id: number;
  tenantSchema: string;
  tableName: string;
  recordId: string;
  versionNumber: number;
  versionLabel: string | null;
  data: Record<string, unknown>;
  savedBy: string | null;
  savedAt: Date;
}

/**
 * Save a version snapshot of a record.
 *
 * @param tenantSlug   - tenant identifier
 * @param tableName    - table API key
 * @param recordId     - UUID of the record
 * @param data         - full record data snapshot
 * @param versionLabel - optional label (e.g. "R1", "Before approval")
 * @param savedBy      - UUID of user saving the version
 * @param db           - Postgres client
 */
export async function saveVersion(
  tenantSlug: string,
  tableName: string,
  recordId: string,
  data: Record<string, unknown>,
  versionLabel: string | undefined,
  db: PoolClient,
  savedBy?: string,
): Promise<void> {
  const tenantSchema = `tenant_${tenantSlug}`;

  // Get the next version number atomically
  const numRes = await db.query<{ next_ver: number }>(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver
       FROM public.record_versions
      WHERE tenant_schema = $1
        AND table_name    = $2
        AND record_id     = $3::uuid`,
    [tenantSchema, tableName, recordId],
  );
  const versionNumber = numRes.rows[0]?.next_ver ?? 1;

  await db.query(
    `INSERT INTO public.record_versions
       (tenant_schema, table_name, record_id, version_number, version_label, data, saved_by)
     VALUES ($1, $2, $3::uuid, $4, $5, $6::jsonb, $7::uuid)`,
    [
      tenantSchema,
      tableName,
      recordId,
      versionNumber,
      versionLabel ?? null,
      JSON.stringify(data),
      savedBy ?? null,
    ],
  );
}

/**
 * List all versions of a record, newest first.
 *
 * @param tenantSlug  - tenant identifier
 * @param tableName   - table API key
 * @param recordId    - UUID of the record
 * @param db          - Postgres client
 * @returns           - array of versions
 */
export async function listVersions(
  tenantSlug: string,
  tableName: string,
  recordId: string,
  db: PoolClient,
): Promise<RecordVersion[]> {
  const tenantSchema = `tenant_${tenantSlug}`;

  const res = await db.query<{
    id: number;
    tenant_schema: string;
    table_name: string;
    record_id: string;
    version_number: number;
    version_label: string | null;
    data: Record<string, unknown>;
    saved_by: string | null;
    saved_at: Date;
  }>(
    `SELECT id, tenant_schema, table_name, record_id,
            version_number, version_label, data, saved_by, saved_at
       FROM public.record_versions
      WHERE tenant_schema = $1
        AND table_name    = $2
        AND record_id     = $3::uuid
      ORDER BY version_number DESC`,
    [tenantSchema, tableName, recordId],
  );

  return res.rows.map((r: {
    id: number;
    tenant_schema: string;
    table_name: string;
    record_id: string;
    version_number: number;
    version_label: string | null;
    data: Record<string, unknown>;
    saved_by: string | null;
    saved_at: Date;
  }) => ({
    id:            r.id,
    tenantSchema:  r.tenant_schema,
    tableName:     r.table_name,
    recordId:      r.record_id,
    versionNumber: r.version_number,
    versionLabel:  r.version_label,
    data:          r.data,
    savedBy:       r.saved_by,
    savedAt:       r.saved_at,
  }));
}

/**
 * Restore a record to a specific version by writing its snapshot back.
 *
 * Returns the snapshot data so the caller can apply it to the live table.
 *
 * @param tenantSlug    - tenant identifier
 * @param tableName     - table API key
 * @param recordId      - UUID of the record
 * @param versionNumber - which version to restore
 * @param db            - Postgres client
 * @returns             - the version's data snapshot
 */
export async function restoreVersion(
  tenantSlug: string,
  tableName: string,
  recordId: string,
  versionNumber: number,
  db: PoolClient,
): Promise<Record<string, unknown>> {
  const tenantSchema = `tenant_${tenantSlug}`;

  const res = await db.query<{ data: Record<string, unknown> }>(
    `SELECT data
       FROM public.record_versions
      WHERE tenant_schema  = $1
        AND table_name     = $2
        AND record_id      = $3::uuid
        AND version_number = $4
      LIMIT 1`,
    [tenantSchema, tableName, recordId, versionNumber],
  );

  if (res.rows.length === 0) {
    throw new Error(
      `restoreVersion: version ${versionNumber} not found for record ${recordId} in ${tenantSlug}.${tableName}`,
    );
  }

  return res.rows[0].data;
}
