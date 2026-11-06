/**
 * Fulfilment engine — Wave 10 public API.
 *
 * Thin façade over src/platform/engines/fulfilment/ that exposes the
 * FulfilmentConfig / FulfilmentStage types used by the builder API
 * and the runtime updateFulfilmentChain / getFulfilmentSummary helpers.
 */

import { Pool, PoolClient } from 'pg';
import {
  getFulfilmentStatus,
  syncFulfilmentStatus,
  createLink,
} from '@/platform/engines/fulfilment/linker';
import type { FulfilmentEngineConfig } from '@/platform/contracts';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FulfilmentStage {
  /** Table ID for this stage (e.g. indent_lines, po_lines, grn_lines) */
  tableId: string;
  /** Field that holds ordered/expected qty */
  qtyField: string;
  /** FK field on this stage's records pointing to the previous stage's record */
  linkField: string;
  /** Optional status field to auto-update (Partial / Fulfilled) */
  statusField?: string;
}

export interface FulfilmentConfig {
  id: string;
  appId: string;
  /** Human-readable name, e.g. "Indent → PO → GRN" */
  name: string;
  /** Ordered stages; index 0 is the originating document, last is the receiving document */
  chain: FulfilmentStage[];
}

export interface FulfilmentSummary {
  orderedQty: number;
  fulfilledQty: number;
  pendingQty: number;
  status: 'Open' | 'Partial' | 'Fulfilled';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

function tenantSchema(tenantSlug: string): string {
  return `tenant_${tenantSlug.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
}

function deriveStatus(
  orderedQty: number,
  fulfilledQty: number,
): FulfilmentSummary['status'] {
  if (fulfilledQty <= 0) return 'Open';
  if (fulfilledQty >= orderedQty) return 'Fulfilled';
  return 'Partial';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * When a downstream stage record is saved, walk the chain upward and update
 * received_qty and status on each ancestor stage's record.
 *
 * @param stageIndex  The index of the stage that was just saved (e.g. 2 for GRN).
 */
export async function updateFulfilmentChain(
  tenantSlug: string,
  config: FulfilmentConfig,
  stageIndex: number,
  record: Record<string, unknown>,
  client: PoolClient,
): Promise<void> {
  if (stageIndex <= 0 || stageIndex >= config.chain.length) {
    // Nothing to cascade upward from the first stage or an out-of-range index.
    return;
  }

  const schema = tenantSchema(tenantSlug);
  const currentStage = config.chain[stageIndex];
  const savedQty = Number(record[currentStage.qtyField] ?? 0);
  const savedId = String(record['id'] ?? '');

  // Walk from stageIndex - 1 back to 0, linking qty received
  for (let i = stageIndex - 1; i >= 0; i--) {
    const parentStage = config.chain[i];
    // The linkField on the current record (or its parent) connects to stage i's record
    const parentRecordId = String(record[currentStage.linkField] ?? '');
    if (!parentRecordId) continue;

    // Lock the parent record and read its qty field
    const parentRes = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${pgIdent(schema)}.${pgIdent(parentStage.tableId)}
       WHERE id = $1
       FOR UPDATE`,
      [parentRecordId],
    );

    if (parentRes.rows.length === 0) continue;
    const parentRow = parentRes.rows[0];
    const orderedQty = Number(parentRow[parentStage.qtyField] ?? 0);

    // Aggregate already-linked qty from fulfilment_links table
    const aggRes = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(qty_linked), 0) AS total
       FROM public.fulfilment_links
       WHERE tenant_slug = $1
         AND source_line_table_id = $2
         AND source_line_record_id = $3`,
      [tenantSlug, parentStage.tableId, parentRecordId],
    );
    const alreadyLinked = Number(aggRes.rows[0].total);
    const newTotal = alreadyLinked + savedQty;

    // Insert the new fulfilment link (using the core engine's helper)
    const fulfilmentEngineConfig: FulfilmentEngineConfig = {
      enabled: true,
      sourceTableId: config.chain[0].tableId,
      sourceLineTableId: parentStage.tableId,
      targetLineTableId: currentStage.tableId,
      qtyOrderedFieldId: parentStage.qtyField,
      qtyReceivedFieldId: currentStage.qtyField,
      statusFieldId: parentStage.statusField ?? '',
    };

    await createLink(
      { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => {} }) } as unknown as import('pg').Pool,
      tenantSlug,
      {
        tenantSlug,
        config: fulfilmentEngineConfig,
        sourceLineTableId: parentStage.tableId,
        sourceLineRecordId: parentRecordId,
        targetLineTableId: currentStage.tableId,
        targetLineRecordId: savedId,
        qtyLinked: savedQty,
        createdBy: 'system',
      },
    );

    // Update status on parent record if a statusField is configured
    if (parentStage.statusField) {
      const newStatus = deriveStatus(orderedQty, newTotal);
      await client.query(
        `UPDATE ${pgIdent(schema)}.${pgIdent(parentStage.tableId)}
         SET ${pgIdent(parentStage.statusField)} = $1
         WHERE id = $2`,
        [newStatus, parentRecordId],
      );
    }

    // Only cascade one level (from GRN to PO, not automatically to Indent),
    // unless the chain linkField resolves further. Callers chain explicitly.
    break;
  }
}

/**
 * Get fulfilment summary for a specific record at a given stage.
 */
export async function getFulfilmentSummary(
  pool: Pool,
  tenantSlug: string,
  config: FulfilmentConfig,
  stageIndex: number,
  recordId: string,
): Promise<FulfilmentSummary> {
  if (stageIndex >= config.chain.length) {
    return { orderedQty: 0, fulfilledQty: 0, pendingQty: 0, status: 'Open' };
  }

  const stage = config.chain[stageIndex];

  // Fetch ordered qty from the actual record
  const schema = tenantSchema(tenantSlug);
  const client = await pool.connect();
  let orderedQty = 0;
  try {
    const res = await client.query<Record<string, unknown>>(
      `SELECT ${pgIdent(stage.qtyField)} AS qty FROM ${pgIdent(schema)}.${pgIdent(stage.tableId)} WHERE id = $1`,
      [recordId],
    );
    if (res.rows.length > 0) {
      orderedQty = Number(res.rows[0]['qty'] ?? 0);
    }
  } finally {
    client.release();
  }

  const fulfilmentStatus = await getFulfilmentStatus(
    pool,
    tenantSlug,
    stage.tableId,
    recordId,
    orderedQty,
  );

  return {
    orderedQty: fulfilmentStatus.qtyOrdered,
    fulfilledQty: fulfilmentStatus.qtyLinked,
    pendingQty: fulfilmentStatus.qtyPending,
    status: deriveStatus(fulfilmentStatus.qtyOrdered, fulfilmentStatus.qtyLinked),
  };
}

// Re-export core helpers for direct use
export { syncFulfilmentStatus, getFulfilmentStatus };
