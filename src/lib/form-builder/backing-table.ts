/**
 * Backing table helpers for form builder.
 *
 * Each form_config can optionally have a "backing table" — a typed ct_* table
 * that mirrors the form's header fields.  Dual-writing there lets you query
 * submissions with SQL JOIN / GROUP BY without parsing the JSONB header_data.
 *
 * If the backing table doesn't exist yet, upsertBackingTableRow is a no-op.
 */
import { PoolClient } from 'pg';
import { tenantQuery } from '@/lib/db/client';

/**
 * Returns the backing table name for a form, or null if none is configured.
 */
export async function getBackingTableName(
  schemaName: string,
  formId: string
): Promise<string | null> {
  const result = await tenantQuery<{ backing_table: string | null }>(
    schemaName,
    `SELECT backing_table FROM form_configs WHERE id = $1`,
    [formId]
  );
  return result.rows[0]?.backing_table ?? null;
}

export interface BackingTableRow {
  id: string;
  submitted_by: string | null;
  thread_id: string;
  revision_number: number;
  is_latest: boolean;
  is_test: boolean;
  headerData: Record<string, unknown>;
}

/**
 * Marks all revisions in a thread as is_latest = false except the given submission.
 * Called after inserting a new revision so the old one is demoted.
 */
export async function markOlderRevisionsNotLatest(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  threadId: string,
  latestSubmissionId: string
): Promise<void> {
  const check = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schemaName, tableName]
  );
  if (!check.rows.length) return;

  await client.query(
    `UPDATE ${tableName} SET is_latest = false
     WHERE thread_id = $1 AND id != $2`,
    [threadId, latestSubmissionId]
  );
}

/**
 * Upserts a row into the backing table using the submission's header data.
 * Silently does nothing if the table does not exist.
 */
export async function upsertBackingTableRow(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  row: BackingTableRow
): Promise<void> {
  // Check the table exists before attempting the upsert
  const check = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schemaName, tableName]
  );
  if (!check.rows.length) return;

  const flat: Record<string, unknown> = {
    id: row.id,
    submitted_by: row.submitted_by,
    thread_id: row.thread_id,
    revision_number: row.revision_number,
    is_latest: row.is_latest,
    is_test: row.is_test,
    ...row.headerData,
  };

  const cols = Object.keys(flat);
  const vals = Object.values(flat);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = cols
    .filter(c => c !== 'id')
    .map(c => `${c} = EXCLUDED.${c}`)
    .join(', ');

  await client.query(
    `INSERT INTO ${tableName} (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (id) DO UPDATE SET ${updates}`,
    vals
  );
}
