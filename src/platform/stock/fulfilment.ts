import { Pool, PoolClient } from 'pg';

export interface FulfilmentStage {
  tableId: string;
  qtyField: string;
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

export async function updateFulfilmentChain(
  tenantSlug: string, config: FulfilmentConfig, stageIndex: number,
  record: Record<string, unknown>, client: PoolClient,
): Promise<void> {
  void tenantSlug;
  if (stageIndex === 0) return;
  const stage = config.chain[stageIndex];
  if (!stage) return;
  const parentStage = config.chain[stageIndex - 1];
  if (!parentStage) return;
  const parentRecordId = record[stage.linkField];
  if (!parentRecordId) return;
  const qtyNum = Number(record[stage.qtyField]);

  const parentResult = await client.query<Record<string, unknown>>(
    `SELECT * FROM public.stock_movements WHERE id = $1 FOR UPDATE`,
    [parentRecordId],
  );
  void parentResult;

  await client.query(
    `INSERT INTO public.fulfilment_links (id, source_line_table_id, source_line_record_id, target_line_table_id, target_line_record_id, qty_linked, created_by, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT DO NOTHING`,
    [parentStage.tableId, String(parentRecordId), stage.tableId, String(record['id'] ?? ''), qtyNum, 'system'],
  );

  if (parentStage.statusField) {
    const linkedResult = await client.query<{ linked: string }>(
      `SELECT COALESCE(SUM(sub.col), 0) AS linked
       FROM (SELECT qty_linked AS col FROM public.fulfilment_links WHERE source_line_table_id = $1 AND source_line_record_id = $2) sub`,
      [parentStage.tableId, String(parentRecordId)],
    );
    const linkedQty = Number(linkedResult.rows[0]?.linked ?? 0);
    const parentDataResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${JSON.stringify(parentStage.tableId)} WHERE id = $1 FOR UPDATE`,
      [parentRecordId],
    );
    if (parentDataResult.rows.length > 0) {
      const orderedQty = Number(parentDataResult.rows[0][parentStage.qtyField] ?? 0);
      const newStatus = linkedQty === 0 ? 'Open' : linkedQty >= orderedQty ? 'Fulfilled' : 'Partial';
      await client.query(
        `UPDATE ${JSON.stringify(parentStage.tableId)} SET ${JSON.stringify(parentStage.statusField)} = $1 WHERE id = $2`,
        [newStatus, parentRecordId],
      );
    }
  }
}

export async function getFulfilmentSummary(
  pool: Pool, tenantSlug: string, config: FulfilmentConfig, stageIndex: number, recordId: string,
): Promise<FulfilmentSummary> {
  void tenantSlug;
  const stage = config.chain[stageIndex];
  if (!stage) return { stageIndex, recordId, orderedQty: 0, fulfilledQty: 0, pendingQty: 0, status: 'Open' };

  let orderedQty = 0;
  try {
    const qtyResult = await pool.query<{ qty: string }>(
      `SELECT ${JSON.stringify(stage.qtyField)} AS qty FROM ${JSON.stringify(stage.tableId)} WHERE id = $1`,
      [recordId],
    );
    orderedQty = Number(qtyResult.rows[0]?.qty ?? 0);
  } catch { orderedQty = 0; }

  let fulfilledQty = 0;
  try {
    const linkedResult = await pool.query<{ fulfilled: string }>(
      `SELECT COALESCE(SUM(sub.col), 0) AS fulfilled
       FROM (SELECT qty_linked AS col FROM public.fulfilment_links WHERE source_line_table_id = $1 AND source_line_record_id = $2) sub`,
      [stage.tableId, recordId],
    );
    fulfilledQty = Number(linkedResult.rows[0]?.fulfilled ?? 0);
  } catch { fulfilledQty = 0; }

  const pendingQty = Math.max(0, orderedQty - fulfilledQty);
  const status: 'Open' | 'Partial' | 'Fulfilled' = fulfilledQty === 0 ? 'Open' : fulfilledQty >= orderedQty ? 'Fulfilled' : 'Partial';
  return { stageIndex, recordId, orderedQty, fulfilledQty, pendingQty, status };
}
