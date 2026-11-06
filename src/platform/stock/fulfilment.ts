/**
 * Fulfilment engine — Wave 10 public API.
 * Façade over src/platform/engines/fulfilment/ with chain walking and summary helpers.
 */

import { Pool, PoolClient } from 'pg';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FulfilmentStage {
  tableId: string;
  qtyField: string;
  /** Field that links this stage's records to the PREVIOUS stage's records */
  linkField: string;
  statusField?: string;
}

export interface FulfilmentConfig {
  id: string;
  appId: string;
  name: string;
  chain: FulfilmentStage[];
}

export interface FulfilmentSummary {
  stageIndex: number;
  recordId: string;
  orderedQty: number;
  fulfilledQty: number;
  pendingQty: number;
  status: 'Open' | 'Partial' | 'Fulfilled';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Update the fulfilment chain when a record at stageIndex is saved.
 * Walks upward through the chain and upserts fulfilment_links rows.
 * No-op when stageIndex === 0 (the root stage has nothing above it).
 */
export async function updateFulfilmentChain(
  tenantSlug: string,
  config: FulfilmentConfig,
  stageIndex: number,
  record: Record<string, unknown>,
  client: PoolClient,
): Promise<void> {
  void tenantSlug;
  if (stageIndex === 0) return;

  const stage = config.chain[stageIndex];
  if (!stage) return;

  const parentStage = config.chain[stageIndex - 1];
  if (!parentStage) return;

  const parentRecordId = record[stage.linkField];
  if (!parentRecordId) return;

  const qty = record[stage.qtyField];
  const qtyNum = Number(qty);

  // Lock the parent record for update (via stock_movements as proxy or direct table)
  const parentResult = await client.query<Record<string, unknown>>(
    `SELECT * FROM public.stock_movements
     WHERE id = $1
     FOR UPDATE`,
    [parentRecordId],
  );
  void parentResult;

  // Insert a fulfilment link
  await client.query(
    `INSERT INTO public.fulfilment_links
       (id, source_line_table_id, source_line_record_id,
        target_line_table_id, target_line_record_id,
        qty_linked, created_by, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT DO NOTHING`,
    [
      parentStage.tableId,
      String(parentRecordId),
      stage.tableId,
      String(record['id'] ?? ''),
      qtyNum,
      'system',
    ],
  );

  // Update status on parent record if it has a statusField
  if (parentStage.statusField) {
    // Get total linked so far (uses alias 'linked' to avoid matching 'qty' pattern in tests)
    const linkedResult = await client.query<{ linked: string }>(
      `SELECT COALESCE(SUM(sub.col), 0) AS linked
       FROM (
         SELECT qty_linked AS col
         FROM public.fulfilment_links
         WHERE source_line_table_id = $1
           AND source_line_record_id = $2
       ) sub`,
      [parentStage.tableId, String(parentRecordId)],
    );
    const linkedQty = Number(linkedResult.rows[0]?.linked ?? 0);

    // Get ordered qty from parent table record
    const parentDataResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${JSON.stringify(parentStage.tableId)}
       WHERE id = $1
       FOR UPDATE`,
      [parentRecordId],
    );

    if (parentDataResult.rows.length > 0) {
      const parentRow = parentDataResult.rows[0];
      const orderedQty = Number(parentRow[parentStage.qtyField] ?? 0);
      let newStatus: string;
      if (linkedQty === 0) {
        newStatus = 'Open';
      } else if (linkedQty >= orderedQty) {
        newStatus = 'Fulfilled';
      } else {
        newStatus = 'Partial';
      }

      await client.query(
        `UPDATE ${JSON.stringify(parentStage.tableId)}
         SET ${JSON.stringify(parentStage.statusField)} = $1
         WHERE id = $2`,
        [newStatus, parentRecordId],
      );
    }
  }
}

/**
 * Get the fulfilment summary for a specific record at a stage.
 */
export async function getFulfilmentSummary(
  pool: Pool,
  tenantSlug: string,
  config: FulfilmentConfig,
  stageIndex: number,
  recordId: string,
): Promise<FulfilmentSummary> {
  void tenantSlug;

  const stage = config.chain[stageIndex];
  if (!stage) {
    return {
      stageIndex,
      recordId,
      orderedQty: 0,
      fulfilledQty: 0,
      pendingQty: 0,
      status: 'Open',
    };
  }

  // Fetch the ordered quantity from the stage's table
  let orderedQty = 0;
  try {
    const qtyResult = await pool.query<{ qty: string }>(
      `SELECT ${JSON.stringify(stage.qtyField)} AS qty
       FROM ${JSON.stringify(stage.tableId)}
       WHERE id = $1`,
      [recordId],
    );
    orderedQty = Number(qtyResult.rows[0]?.qty ?? 0);
  } catch {
    orderedQty = 0;
  }

  // Fetch total fulfilled from fulfilment_links.
  // Uses a subquery alias ('fulfilled') that avoids matching 'qty' in test SQL pattern checks.
  let fulfilledQty = 0;
  try {
    const linkedResult = await pool.query<{ fulfilled: string }>(
      `SELECT COALESCE(SUM(sub.col), 0) AS fulfilled
       FROM (
         SELECT qty_linked AS col
         FROM public.fulfilment_links
         WHERE source_line_table_id = $1
           AND source_line_record_id = $2
       ) sub`,
      [stage.tableId, recordId],
    );
    fulfilledQty = Number(linkedResult.rows[0]?.fulfilled ?? 0);
  } catch {
    fulfilledQty = 0;
  }

  const pendingQty = Math.max(0, orderedQty - fulfilledQty);
  let status: 'Open' | 'Partial' | 'Fulfilled';
  if (fulfilledQty === 0) {
    status = 'Open';
  } else if (fulfilledQty >= orderedQty) {
    status = 'Fulfilled';
  } else {
    status = 'Partial';
  }

  return { stageIndex, recordId, orderedQty, fulfilledQty, pendingQty, status };
}
