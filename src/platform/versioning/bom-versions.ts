/**
 * BOM versioning — reuses platform.record_versions with version_type='bom_revision'.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type { QuoteVersion } from './quote-versions';

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

async function fetchBomSnapshot(
  appId: string,
  tenantSlug: string,
  bomId: string,
  pgPool: Pool,
): Promise<Record<string, unknown>> {
  const schema = tenantSlug.replace(/[^a-z0-9_]/gi, '_');
  const client = await pgPool.connect();
  try {
    const headerRes = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${JSON.stringify(schema)}."boms" WHERE id = $1 LIMIT 1`,
      [bomId],
    );
    const header = headerRes.rows[0] ?? {};

    let lines: Record<string, unknown>[] = [];
    try {
      const linesRes = await client.query<Record<string, unknown>>(
        `SELECT * FROM ${JSON.stringify(schema)}."bom_lines" WHERE bom_id = $1 ORDER BY id`,
        [bomId],
      );
      lines = linesRes.rows;
    } catch {
      // no child table
    }
    return { header, lines };
  } finally {
    client.release();
  }
}

export async function createBomVersion(
  appId: string,
  tenantSlug: string,
  bomId: string,
  userId: string,
  changeNote: string,
  pgPool: Pool,
): Promise<QuoteVersion> {
  const existing = await pgPool.query<{ max_ver: number | null }>(
    `SELECT MAX(version_number) AS max_ver FROM platform.record_versions
     WHERE record_id = $1 AND version_type = 'bom_revision'`,
    [bomId],
  );
  const nextVer = (existing.rows[0]?.max_ver ?? -1) + 1;
  const label = `R${nextVer}`;

  const snapshot = await fetchBomSnapshot(appId, tenantSlug, bomId, pgPool);
  const id = randomUUID();

  const res = await pgPool.query<RecordVersionRow>(
    `INSERT INTO platform.record_versions
       (id, app_id, table_api_key, record_id, version_number, version_label, version_type, snapshot, status, note, created_by)
     VALUES ($1,$2,'boms',$3,$4,$5,'bom_revision',$6,'draft',$7,$8)
     RETURNING *`,
    [id, appId, bomId, nextVer, label, JSON.stringify(snapshot), changeNote, userId],
  );
  return rowToVersion(res.rows[0]);
}

export async function getEffectiveBom(
  bomId: string,
  pgPool: Pool,
  asOf?: Date,
): Promise<QuoteVersion | null> {
  let res;
  if (asOf) {
    res = await pgPool.query<RecordVersionRow>(
      `SELECT * FROM platform.record_versions
       WHERE record_id = $1 AND version_type = 'bom_revision' AND created_at <= $2
       ORDER BY version_number DESC LIMIT 1`,
      [bomId, asOf],
    );
  } else {
    res = await pgPool.query<RecordVersionRow>(
      `SELECT * FROM platform.record_versions
       WHERE record_id = $1 AND version_type = 'bom_revision'
       ORDER BY version_number DESC LIMIT 1`,
      [bomId],
    );
  }
  return res.rows[0] ? rowToVersion(res.rows[0]) : null;
}

export async function listBomVersions(
  bomId: string,
  pgPool: Pool,
): Promise<QuoteVersion[]> {
  const res = await pgPool.query<RecordVersionRow>(
    `SELECT * FROM platform.record_versions
     WHERE record_id = $1 AND version_type = 'bom_revision'
     ORDER BY version_number ASC`,
    [bomId],
  );
  return res.rows.map(rowToVersion);
}
