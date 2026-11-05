/**
 * Fulfilment linker: creates and queries source→target line links.
 */

import { Pool } from 'pg';
import type { FulfilmentEngineConfig } from '@/platform/contracts';
import type { FulfilmentLink, FulfilmentStatus } from './types';
import { FulfilmentError } from './errors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToLink(
  row: Record<string, unknown>,
  config: FulfilmentEngineConfig,
  tenantSlug: string,
): FulfilmentLink {
  return {
    id: String(row['id']),
    tenantSlug,
    config,
    sourceLineTableId: String(row['source_line_table_id']),
    sourceLineRecordId: String(row['source_line_record_id']),
    targetLineTableId: String(row['target_line_table_id']),
    targetLineRecordId: String(row['target_line_record_id']),
    qtyLinked: Number(row['qty_linked']),
    createdAt: new Date(String(row['created_at'])),
    createdBy: String(row['created_by']),
  };
}

function deriveStatus(
  qtyOrdered: number,
  qtyLinked: number,
): FulfilmentStatus['status'] {
  if (qtyLinked === 0) return 'open';
  if (qtyLinked > qtyOrdered) return 'over';
  if (qtyLinked >= qtyOrdered) return 'fulfilled';
  return 'partial';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a link between a source line and a target line.
 */
export async function createLink(
  pool: Pool,
  tenantSlug: string,
  link: Omit<FulfilmentLink, 'id' | 'createdAt'>,
): Promise<FulfilmentLink> {
  const client = await pool.connect();
  try {
    const res = await client.query<Record<string, unknown>>(
      `INSERT INTO public.fulfilment_links
         (tenant_slug, source_line_table_id, source_line_record_id,
          target_line_table_id, target_line_record_id, qty_linked, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantSlug,
        link.sourceLineTableId,
        link.sourceLineRecordId,
        link.targetLineTableId,
        link.targetLineRecordId,
        link.qtyLinked,
        link.createdBy,
      ],
    );
    return rowToLink(res.rows[0], link.config, tenantSlug);
  } finally {
    client.release();
  }
}

/**
 * Get fulfilment status for a source line.
 * qtyOrderedFieldId is the field name on the source-line record that holds
 * the ordered quantity; callers must fetch qtyOrdered themselves and pass
 * the value directly — this function only aggregates the links.
 */
export async function getFulfilmentStatus(
  pool: Pool,
  tenantSlug: string,
  sourceLineTableId: string,
  sourceLineRecordId: string,
  qtyOrdered: number,
): Promise<FulfilmentStatus> {
  const client = await pool.connect();
  try {
    const res = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(qty_linked), 0) AS total
       FROM public.fulfilment_links
       WHERE tenant_slug = $1
         AND source_line_table_id = $2
         AND source_line_record_id = $3`,
      [tenantSlug, sourceLineTableId, sourceLineRecordId],
    );
    const qtyLinked = Number(res.rows[0].total);
    const qtyPending = Math.max(0, qtyOrdered - qtyLinked);
    return {
      sourceLineId: sourceLineRecordId,
      qtyOrdered,
      qtyLinked,
      qtyPending,
      status: deriveStatus(qtyOrdered, qtyLinked),
    };
  } finally {
    client.release();
  }
}

/**
 * Get all target lines linked to a source line.
 */
export async function getLinkedTargets(
  pool: Pool,
  tenantSlug: string,
  sourceLineTableId: string,
  sourceLineRecordId: string,
): Promise<FulfilmentLink[]> {
  const client = await pool.connect();
  try {
    const res = await client.query<Record<string, unknown>>(
      `SELECT * FROM public.fulfilment_links
       WHERE tenant_slug = $1
         AND source_line_table_id = $2
         AND source_line_record_id = $3
       ORDER BY created_at`,
      [tenantSlug, sourceLineTableId, sourceLineRecordId],
    );
    // config is not stored in the row; callers who need it must pass it in.
    // We return a minimal placeholder so the type contract is satisfied.
    const placeholderConfig: FulfilmentEngineConfig = {
      enabled: true,
      sourceTableId: '',
      sourceLineTableId,
      targetLineTableId: '',
      qtyOrderedFieldId: '',
      qtyReceivedFieldId: '',
      statusFieldId: '',
    };
    return res.rows.map((row) => rowToLink(row, placeholderConfig, tenantSlug));
  } finally {
    client.release();
  }
}

/**
 * Recompute the aggregate status for all source lines of a source record,
 * then write the derived status back to the source record's status field.
 *
 * This runs in a single transaction to stay consistent.
 */
export async function syncFulfilmentStatus(
  pool: Pool,
  tenantSlug: string,
  config: FulfilmentEngineConfig,
  sourceRecordId: string,
): Promise<void> {
  if (!config.enabled) return;

  const schema = `tenant_${tenantSlug.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
  const sourceLineTable = config.sourceLineTableId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch all source lines for this record
    const linesRes = await client.query<Record<string, unknown>>(
      `SELECT id, "${config.qtyOrderedFieldId}" AS qty_ordered
       FROM ${pgIdent(schema)}.${pgIdent(sourceLineTable)}
       WHERE _parent_id = $1`,
      [sourceRecordId],
    );

    if (linesRes.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    let allFulfilled = true;
    let anyLinked = false;
    let anyOver = false;

    for (const lineRow of linesRes.rows) {
      const lineId = String(lineRow['id']);
      const qtyOrdered = Number(lineRow['qty_ordered'] ?? 0);

      const agg = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(qty_linked), 0) AS total
         FROM public.fulfilment_links
         WHERE tenant_slug = $1
           AND source_line_table_id = $2
           AND source_line_record_id = $3`,
        [tenantSlug, sourceLineTable, lineId],
      );
      const qtyLinked = Number(agg.rows[0].total);

      if (qtyLinked > qtyOrdered) anyOver = true;
      if (qtyLinked > 0) anyLinked = true;
      if (qtyLinked < qtyOrdered) allFulfilled = false;
    }

    let newStatus: string;
    if (anyOver) {
      newStatus = 'over';
    } else if (allFulfilled) {
      newStatus = 'fulfilled';
    } else if (anyLinked) {
      newStatus = 'partial';
    } else {
      newStatus = 'open';
    }

    // Determine which table holds the source record (the header, not the lines)
    const sourceTable = config.sourceTableId;
    if (!sourceTable) {
      throw new FulfilmentError('FulfilmentEngineConfig.sourceTableId is required for syncFulfilmentStatus');
    }

    await client.query(
      `UPDATE ${pgIdent(schema)}.${pgIdent(sourceTable)}
       SET "${config.statusFieldId}" = $1
       WHERE id = $2`,
      [newStatus, sourceRecordId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}
