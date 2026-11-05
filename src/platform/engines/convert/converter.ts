/**
 * Convert-to engine: creates a new record (and optional lines) from one or
 * more source records, with field mapping and optional fulfilment links.
 */

import { Pool } from 'pg';
import type { CrudContext, RecordData } from '@/platform/data/crud';
import type { ExprEngine, ExprContext, ExprValue } from '@/platform/expr';
import { createLink } from '@/platform/engines/fulfilment/linker';
import type { ConvertConfig, ConvertResult } from './types';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

function tenantSchema(tenantSlug: string): string {
  return `tenant_${tenantSlug.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
}

/** Fetch a record by id from a tenant table. */
async function fetchRecord(
  pool: Pool,
  schema: string,
  tableId: string,
  recordId: string,
): Promise<RecordData> {
  const client = await pool.connect();
  try {
    const res = await client.query<RecordData>(
      `SELECT * FROM ${pgIdent(schema)}.${pgIdent(tableId)} WHERE id = $1`,
      [recordId],
    );
    if (res.rows.length === 0) {
      throw new Error(`Record ${recordId} not found in ${tableId}`);
    }
    return res.rows[0];
  } finally {
    client.release();
  }
}

/** Fetch all child lines for a parent record. */
async function fetchLines(
  pool: Pool,
  schema: string,
  lineTableId: string,
  parentId: string,
): Promise<RecordData[]> {
  const client = await pool.connect();
  try {
    const res = await client.query<RecordData>(
      `SELECT * FROM ${pgIdent(schema)}.${pgIdent(lineTableId)}
       WHERE _parent_id = $1
       ORDER BY id`,
      [parentId],
    );
    return res.rows;
  } finally {
    client.release();
  }
}

/** Insert a raw row into a tenant table. Returns the inserted row. */
async function insertRaw(
  pool: Pool,
  schema: string,
  tableId: string,
  data: RecordData,
  userId: string,
): Promise<RecordData> {
  const client = await pool.connect();
  try {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const colList = keys.map(pgIdent).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 2}`).join(', ');

    const sql = `
      INSERT INTO ${pgIdent(schema)}.${pgIdent(tableId)}
        (${colList}, _created_by, _updated_by)
      VALUES (${placeholders}, $1::uuid, $1::uuid)
      RETURNING *
    `;

    const res = await client.query<RecordData>(sql, [userId, ...values]);
    return res.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Apply a field mapping array to a source record, returning the mapped data.
 * When transformExpr is set it is evaluated via exprEngine.
 */
function applyFieldMapping(
  mapping: Array<{ sourceFieldId: string; targetFieldId: string; transformExpr?: string }>,
  sourceRecord: RecordData,
  exprEngine: ExprEngine,
  ctx: CrudContext,
): RecordData {
  const result: RecordData = {};
  for (const m of mapping) {
    const rawValue: ExprValue = sourceRecord[m.sourceFieldId] as ExprValue ?? null;
    let mapped: ExprValue;
    if (m.transformExpr) {
      const exprCtx: ExprContext = {
        record: sourceRecord as Record<string, ExprValue>,
        user: {
          id: ctx.userId,
          email: '',
          roles: ctx.claims.roles,
          locations: ctx.claims.locations,
        },
        vars: { value: rawValue },
        now: ctx.now,
      };
      mapped = exprEngine.evaluateSource(m.transformExpr, exprCtx);
    } else {
      mapped = rawValue;
    }
    result[m.targetFieldId] = mapped;
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert one or more source records into a single target record.
 *
 * Header fields are merged from the first source record (or derived via
 * transformExpr). Lines from all source records are collected and mapped
 * into target lines.  If createFulfilmentLinks is true, a FulfilmentLink
 * is created for each source-line → target-line pair.
 */
export async function convertRecords(
  pool: Pool,
  tenantSlug: string,
  config: ConvertConfig,
  sourceRecordIds: string[],
  ctx: CrudContext,
  exprEngine: ExprEngine,
): Promise<ConvertResult> {
  if (sourceRecordIds.length === 0) {
    throw new Error('convertRecords: sourceRecordIds must not be empty');
  }

  const schema = tenantSchema(tenantSlug);

  // 1. Load all source records + their lines
  const sourceRecords: RecordData[] = await Promise.all(
    sourceRecordIds.map((id) => fetchRecord(pool, schema, config.sourceTableId, id)),
  );

  type SourceLine = { parentRecordId: string; line: RecordData };
  let sourceLines: SourceLine[] = [];
  if (config.sourceLineTableId && config.lineFieldMapping && config.lineFieldMapping.length > 0) {
    const lineArrays = await Promise.all(
      sourceRecordIds.map(async (id) => {
        const lines = await fetchLines(pool, schema, config.sourceLineTableId!, id);
        return lines.map((line) => ({ parentRecordId: id, line }));
      }),
    );
    sourceLines = lineArrays.flat();
  }

  // 2. Apply header field mapping (use first source record as the merge base)
  const primarySource = sourceRecords[0];
  const headerData = applyFieldMapping(
    config.headerFieldMapping,
    primarySource,
    exprEngine,
    ctx,
  );

  // 3. Insert target header record
  const targetRecord = await insertRaw(pool, schema, config.targetTableId, headerData, ctx.userId);
  const targetRecordId = String(targetRecord['id']);

  // 4. Apply line field mapping → insert target lines
  const targetLineRecordIds: string[] = [];
  const fulfilmentLinkIds: string[] = [];

  for (const { parentRecordId, line } of sourceLines) {
    if (!config.lineFieldMapping || !config.targetLineTableId) continue;
    const lineData = applyFieldMapping(config.lineFieldMapping, line, exprEngine, ctx);
    // Link the target line to the target header record
    lineData['_parent_id'] = targetRecordId;

    const targetLine = await insertRaw(pool, schema, config.targetLineTableId, lineData, ctx.userId);
    const targetLineId = String(targetLine['id']);
    targetLineRecordIds.push(targetLineId);

    // 5. Create fulfilment links if requested
    if (config.createFulfilmentLinks && config.sourceLineTableId && config.targetLineTableId) {
      // We need a minimal FulfilmentEngineConfig stub to satisfy the type.
      // In production this would come from the TableDef; here we use what we know.
      const fulfilmentConfig = {
        enabled: true,
        sourceTableId: config.sourceTableId,
        sourceLineTableId: config.sourceLineTableId,
        targetLineTableId: config.targetLineTableId,
        qtyOrderedFieldId: '',
        qtyReceivedFieldId: '',
        statusFieldId: '',
      };

      const fLink = await createLink(pool, tenantSlug, {
        tenantSlug,
        config: fulfilmentConfig,
        sourceLineTableId: config.sourceLineTableId,
        sourceLineRecordId: String(line['id']),
        targetLineTableId: config.targetLineTableId,
        targetLineRecordId: targetLineId,
        qtyLinked: Number(line['qty'] ?? line['quantity'] ?? 1),
        createdBy: ctx.userId,
      });
      fulfilmentLinkIds.push(fLink.id);
    }

    void parentRecordId; // used in future for multi-source merge tracking
  }

  return { targetRecordId, targetLineRecordIds, fulfilmentLinkIds };
}
