/**
 * Quote versioning — R0, R1, R2 snapshot system.
 * Stores full record + child line snapshots in platform.record_versions.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface QuoteVersion {
  versionNumber: number;      // 0 = R0, 1 = R1, etc.
  label: string;              // 'R0', 'R1', 'R2'
  recordSnapshot: Record<string, unknown>;  // full record + lines at this version
  createdAt: Date;
  createdBy: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  note?: string;
}

interface RecordVersionRow {
  id: string;
  app_id: string;
  table_api_key: string;
  record_id: string;
  version_number: number;
  version_label: string;
  version_type: string;
  snapshot: Record<string, unknown>;
  status: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Date;
}

function rowToVersion(row: RecordVersionRow): QuoteVersion {
  return {
    versionNumber: row.version_number,
    label: row.version_label,
    recordSnapshot: row.snapshot,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ?? 'system',
    status: (row.status as QuoteVersion['status']) ?? 'draft',
    note: row.note ?? undefined,
  };
}

/** Fetch current record + child lines from the live tables. */
async function fetchRecordSnapshot(
  appId: string,
  tenantSlug: string,
  recordId: string,
  tableApiKey: string,
  pgPool: Pool,
): Promise<Record<string, unknown>> {
  const schema = tenantSlug.replace(/[^a-z0-9_]/gi, '_');
  const client = await pgPool.connect();
  try {
    // Fetch the parent record
    const recRes = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${JSON.stringify(schema)}.${JSON.stringify(tableApiKey)} WHERE id = $1 LIMIT 1`,
      [recordId],
    );
    const record = recRes.rows[0] ?? {};

    // Try to fetch child lines (table named <tableApiKey>_lines or similar)
    // We attempt a convention-based child table; if absent, lines = []
    let lines: Record<string, unknown>[] = [];
    try {
      const linesRes = await client.query<Record<string, unknown>>(
        `SELECT * FROM ${JSON.stringify(schema)}.${JSON.stringify(tableApiKey + '_lines')} WHERE record_id = $1 ORDER BY id`,
        [recordId],
      );
      lines = linesRes.rows;
    } catch {
      // child table doesn't exist — fine
    }

    return { record, lines };
  } finally {
    client.release();
  }
}

/** Restore record + lines from a snapshot. */
async function applySnapshot(
  appId: string,
  tenantSlug: string,
  recordId: string,
  tableApiKey: string,
  snapshot: Record<string, unknown>,
  pgPool: Pool,
): Promise<void> {
  const schema = tenantSlug.replace(/[^a-z0-9_]/gi, '_');
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    const record = snapshot['record'] as Record<string, unknown> | undefined;
    const lines = (snapshot['lines'] as Record<string, unknown>[] | undefined) ?? [];

    if (record) {
      const fields = Object.keys(record).filter((k) => k !== 'id');
      if (fields.length > 0) {
        const setClause = fields.map((f, i) => `${JSON.stringify(f)} = $${i + 2}`).join(', ');
        await client.query(
          `UPDATE ${JSON.stringify(schema)}.${JSON.stringify(tableApiKey)} SET ${setClause} WHERE id = $1`,
          [recordId, ...fields.map((f) => record[f])],
        );
      }
    }

    if (lines.length > 0) {
      await client.query(
        `DELETE FROM ${JSON.stringify(schema)}.${JSON.stringify(tableApiKey + '_lines')} WHERE record_id = $1`,
        [recordId],
      );
      for (const line of lines) {
        const lineFields = Object.keys(line);
        const cols = lineFields.map((f) => JSON.stringify(f)).join(', ');
        const vals = lineFields.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${JSON.stringify(schema)}.${JSON.stringify(tableApiKey + '_lines')} (${cols}) VALUES (${vals})`,
          lineFields.map((f) => line[f]),
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createQuoteVersion(
  appId: string,
  tenantSlug: string,
  recordId: string,
  tableApiKey: string,
  userId: string,
  note: string | undefined,
  pgPool: Pool,
): Promise<QuoteVersion> {
  // Determine next version number
  const existing = await pgPool.query<{ max_ver: number | null }>(
    `SELECT MAX(version_number) AS max_ver FROM platform.record_versions
     WHERE record_id = $1 AND version_type = 'quote_revision'`,
    [recordId],
  );
  const nextVer = (existing.rows[0]?.max_ver ?? -1) + 1;
  const label = `R${nextVer}`;

  const snapshot = await fetchRecordSnapshot(appId, tenantSlug, recordId, tableApiKey, pgPool);

  const id = randomUUID();
  const res = await pgPool.query<RecordVersionRow>(
    `INSERT INTO platform.record_versions
       (id, app_id, table_api_key, record_id, version_number, version_label, version_type, snapshot, status, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'quote_revision',$7,'draft',$8,$9)
     RETURNING *`,
    [id, appId, tableApiKey, recordId, nextVer, label, JSON.stringify(snapshot), note ?? null, userId],
  );
  return rowToVersion(res.rows[0]);
}

export async function listQuoteVersions(
  recordId: string,
  pgPool: Pool,
): Promise<QuoteVersion[]> {
  const res = await pgPool.query<RecordVersionRow>(
    `SELECT * FROM platform.record_versions
     WHERE record_id = $1 AND version_type = 'quote_revision'
     ORDER BY version_number ASC`,
    [recordId],
  );
  return res.rows.map(rowToVersion);
}

export async function restoreQuoteVersion(
  appId: string,
  tenantSlug: string,
  recordId: string,
  tableApiKey: string,
  versionNumber: number,
  userId: string,
  pgPool: Pool,
): Promise<void> {
  const res = await pgPool.query<RecordVersionRow>(
    `SELECT * FROM platform.record_versions
     WHERE record_id = $1 AND version_number = $2 AND version_type = 'quote_revision'`,
    [recordId, versionNumber],
  );
  if (!res.rows[0]) throw new Error(`Version R${versionNumber} not found for record ${recordId}`);

  const snapshot = res.rows[0].snapshot;
  await applySnapshot(appId, tenantSlug, recordId, tableApiKey, snapshot, pgPool);

  // Record the restore action as a new version
  const existing = await pgPool.query<{ max_ver: number | null }>(
    `SELECT MAX(version_number) AS max_ver FROM platform.record_versions WHERE record_id = $1 AND version_type = 'quote_revision'`,
    [recordId],
  );
  const nextVer = (existing.rows[0]?.max_ver ?? -1) + 1;
  const label = `R${nextVer}`;
  const id = randomUUID();
  await pgPool.query(
    `INSERT INTO platform.record_versions
       (id, app_id, table_api_key, record_id, version_number, version_label, version_type, snapshot, status, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'quote_revision',$7,'draft',$8,$9)`,
    [id, appId, tableApiKey, recordId, nextVer, label, JSON.stringify(snapshot), `Restored from R${versionNumber}`, userId],
  );
}

export async function compareQuoteVersions(
  recordId: string,
  versionA: number,
  versionB: number,
  pgPool: Pool,
): Promise<{ field: string; before: unknown; after: unknown }[]> {
  const res = await pgPool.query<RecordVersionRow>(
    `SELECT * FROM platform.record_versions
     WHERE record_id = $1 AND version_number = ANY($2) AND version_type = 'quote_revision'`,
    [recordId, [versionA, versionB]],
  );
  const byVer = new Map(res.rows.map((r) => [r.version_number, r.snapshot]));
  const snapA = (byVer.get(versionA) ?? {}) as Record<string, unknown>;
  const snapB = (byVer.get(versionB) ?? {}) as Record<string, unknown>;

  const recA = (snapA['record'] ?? {}) as Record<string, unknown>;
  const recB = (snapB['record'] ?? {}) as Record<string, unknown>;

  const allKeys = new Set([...Object.keys(recA), ...Object.keys(recB)]);
  const diffs: { field: string; before: unknown; after: unknown }[] = [];
  for (const key of allKeys) {
    const before = recA[key] ?? null;
    const after = recB[key] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diffs.push({ field: key, before, after });
    }
  }
  return diffs;
}
