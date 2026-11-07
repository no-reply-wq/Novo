/**
 * Fulfilment engine — high-level API (spec §1.6).
 *
 * Wraps the lower-level linker.ts with config-aware helpers that:
 *  - validate qty against pending qty
 *  - update source-line status after linking
 *  - return FulfilmentSummary / enriched line lists
 */

import { Pool } from 'pg';
import type { FulfilmentConfig, FulfilmentLinkRecord, FulfilmentSummary } from './types';
import { createLink, getFulfilmentStatus } from './linker';
import { FulfilmentError, OverFulfilmentError } from './errors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

function tenantSchema(slug: string): string {
  return `tenant_${slug.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
}

/** Read a single numeric field from a tenant table row. */
async function readNumericField(
  pool: Pool,
  schema: string,
  tableId: string,
  recordId: string,
  fieldApiKey: string,
): Promise<number> {
  const client = await pool.connect();
  try {
    const res = await client.query<Record<string, unknown>>(
      `SELECT ${pgIdent(fieldApiKey)} AS val FROM ${pgIdent(schema)}.${pgIdent(tableId)} WHERE id = $1`,
      [recordId],
    );
    if (!res.rows.length) throw new FulfilmentError(`Record ${recordId} not found in ${tableId}`);
    return Number(res.rows[0]['val'] ?? 0);
  } finally {
    client.release();
  }
}

/** Update a text field on a tenant table row. */
async function writeTextField(
  pool: Pool,
  schema: string,
  tableId: string,
  recordId: string,
  fieldApiKey: string,
  value: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE ${pgIdent(schema)}.${pgIdent(tableId)} SET ${pgIdent(fieldApiKey)} = $1 WHERE id = $2`,
      [value, recordId],
    );
  } finally {
    client.release();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Link a source line to a target line for the given qty.
 * Validates that qty ≤ pending qty on the source line before creating the link.
 */
export async function linkLines(
  configId: string,
  sourceLineId: string,
  targetLineId: string,
  qty: number,
  userId: string,
  tenantSlug: string,
  pgPool: Pool,
  config: FulfilmentConfig,
): Promise<FulfilmentLinkRecord> {
  if (qty <= 0) throw new FulfilmentError('qty must be > 0');

  const schema = tenantSchema(tenantSlug);

  // Fetch ordered qty from source line
  const qtyOrdered = await readNumericField(
    pgPool,
    schema,
    config.sourceLineTableApiKey,
    sourceLineId,
    config.sourceQtyFieldApiKey,
  );

  // Calculate current pending qty
  const summary = await getFulfilmentStatus(
    pgPool,
    tenantSlug,
    config.sourceLineTableApiKey,
    sourceLineId,
    qtyOrdered,
  );

  if (qty > summary.qtyPending) {
    throw new OverFulfilmentError(sourceLineId, qtyOrdered, summary.qtyLinked + qty);
  }

  // Build a minimal FulfilmentEngineConfig compatible with linker.createLink
  const engineConfig = {
    enabled: true,
    sourceTableId: config.sourceTableApiKey,
    sourceLineTableId: config.sourceLineTableApiKey,
    targetLineTableId: config.targetLineTableApiKey,
    qtyOrderedFieldId: config.sourceQtyFieldApiKey,
    qtyReceivedFieldId: config.targetQtyFieldApiKey,
    statusFieldId: config.sourceStatusFieldApiKey ?? '',
  };

  const link = await createLink(pgPool, tenantSlug, {
    tenantSlug,
    config: engineConfig,
    sourceLineTableId: config.sourceLineTableApiKey,
    sourceLineRecordId: sourceLineId,
    targetLineTableId: config.targetLineTableApiKey,
    targetLineRecordId: targetLineId,
    qtyLinked: qty,
    createdBy: userId,
  });

  // Update source line status if configured
  if (config.sourceStatusFieldApiKey && (config.fulfilledStatusValue || config.partialStatusValue)) {
    const newQtyLinked = summary.qtyLinked + qty;
    let newStatus: string | null = null;

    if (newQtyLinked >= qtyOrdered && config.fulfilledStatusValue) {
      newStatus = config.fulfilledStatusValue;
    } else if (newQtyLinked > 0 && config.partialStatusValue) {
      newStatus = config.partialStatusValue;
    }

    if (newStatus) {
      await writeTextField(
        pgPool,
        schema,
        config.sourceLineTableApiKey,
        sourceLineId,
        config.sourceStatusFieldApiKey,
        newStatus,
      );
    }
  }

  // Translate linker FulfilmentLink to our FulfilmentLink shape
  const result: FulfilmentLinkRecord = {
    id: link.id,
    configId,
    appId: config.appId,
    sourceLineId,
    targetLineId,
    linkedQty: qty,
    createdAt: link.createdAt,
  };

  return result;
}

/**
 * Get fulfilment summary for a single source line.
 */
export async function getFulfilmentSummary(
  configId: string,
  sourceLineId: string,
  pgPool: Pool,
  config: FulfilmentConfig,
  tenantSlug: string,
): Promise<FulfilmentSummary> {
  const schema = tenantSchema(tenantSlug);

  const qtyOrdered = await readNumericField(
    pgPool,
    schema,
    config.sourceLineTableApiKey,
    sourceLineId,
    config.sourceQtyFieldApiKey,
  );

  const status = await getFulfilmentStatus(
    pgPool,
    tenantSlug,
    config.sourceLineTableApiKey,
    sourceLineId,
    qtyOrdered,
  );

  void configId; // available for future filtering by config

  return {
    sourceLineId,
    orderedQty: status.qtyOrdered,
    linkedQty: status.qtyLinked,
    pendingQty: status.qtyPending,
    status:
      status.status === 'open'
        ? 'pending'
        : status.status === 'partial'
          ? 'partial'
          : status.status === 'fulfilled'
            ? 'fulfilled'
            : 'fulfilled', // 'over' treated as fulfilled for callers
  };
}

/**
 * Returns all source lines for a source header, enriched with fulfilment data.
 */
export async function getSourceLinesWithFulfilment(
  configId: string,
  sourceHeaderId: string,
  tenantSlug: string,
  pgPool: Pool,
  config: FulfilmentConfig,
): Promise<Array<FulfilmentSummary & { lineData: Record<string, unknown> }>> {
  const schema = tenantSchema(tenantSlug);
  const client = await pgPool.connect();

  try {
    const linesRes = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${pgIdent(schema)}.${pgIdent(config.sourceLineTableApiKey)} WHERE _parent_id = $1 ORDER BY id`,
      [sourceHeaderId],
    );

    const results = await Promise.all(
      linesRes.rows.map(async (row) => {
        const lineId = String(row['id']);
        const qtyOrdered = Number(row[config.sourceQtyFieldApiKey] ?? 0);

        const status = await getFulfilmentStatus(
          pgPool,
          tenantSlug,
          config.sourceLineTableApiKey,
          lineId,
          qtyOrdered,
        );

        void configId; // future: filter by config

        const summary: FulfilmentSummary = {
          sourceLineId: lineId,
          orderedQty: status.qtyOrdered,
          linkedQty: status.qtyLinked,
          pendingQty: status.qtyPending,
          status:
            status.status === 'open'
              ? 'pending'
              : status.status === 'partial'
                ? 'partial'
                : 'fulfilled',
        };

        return { ...summary, lineData: row };
      }),
    );

    return results;
  } finally {
    client.release();
  }
}
