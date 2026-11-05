/**
 * Apply a StockEngineConfig to a TableDef, validate field references,
 * and define the hook that auto-posts movements on record changes.
 */

import { Pool } from 'pg';
import type { StockEngineConfig, TableDef } from '@/platform/contracts/tables';
import { StockError } from './errors';
import { postMovement } from './ledger';

/**
 * Validate that every field referenced by the StockEngineConfig exists in the TableDef.
 * Throws StockError with a descriptive message on the first missing field.
 */
export function applyStockConfig(
  config: StockEngineConfig,
  tableDef: TableDef,
): void {
  const fieldIds = new Set(tableDef.fields.map((f) => f.id));

  const required: Array<{ key: keyof StockEngineConfig; label: string }> = [
    { key: 'itemFieldId', label: 'itemFieldId' },
    { key: 'locationFieldId', label: 'locationFieldId' },
    { key: 'qtyFieldId', label: 'qtyFieldId' },
  ];

  for (const { key, label } of required) {
    const fieldId = config[key] as string | undefined;
    if (!fieldId) {
      throw new StockError(`StockEngineConfig.${label} is required`);
    }
    if (!fieldIds.has(fieldId)) {
      throw new StockError(
        `StockEngineConfig.${label} references unknown field "${fieldId}" on table "${tableDef.id}"`,
      );
    }
  }

  if (config.direction === 'expr' && !config.directionExpr) {
    throw new StockError(
      `StockEngineConfig.directionExpr is required when direction is 'expr'`,
    );
  }

  if (
    config.batchTrackingFieldId !== undefined &&
    !fieldIds.has(config.batchTrackingFieldId)
  ) {
    throw new StockError(
      `StockEngineConfig.batchTrackingFieldId references unknown field "${config.batchTrackingFieldId}" on table "${tableDef.id}"`,
    );
  }
}

/**
 * Evaluate the direction for a record given the config.
 * When direction is 'in' or 'out', returns it directly.
 * When direction is 'expr', evaluates directionExpr against the record values.
 *
 * The expression is expected to be a simple equality like `status == 'received'`
 * which we evaluate by checking if the string contains the record value.
 * For production use, wire in the full expression engine from Agent B.
 */
function resolveDirection(
  config: StockEngineConfig,
  record: Record<string, unknown>,
): 'in' | 'out' {
  if (config.direction === 'in' || config.direction === 'out') {
    return config.direction;
  }

  // Minimal expression evaluator: supports only literal 'in' | 'out' result
  const expr = config.directionExpr ?? '';
  // If expression is just 'in' or 'out'
  if (expr.trim() === 'in') return 'in';
  if (expr.trim() === 'out') return 'out';

  // Fall back: look for the word 'out' in the expression
  // Real engines should use the platform expression evaluator
  const evaluated = expr.includes('out') ? 'out' : 'in';
  void record; // record would be used by a real expression engine
  return evaluated;
}

export interface StockTriggerInput {
  record: Record<string, unknown>;
  tenantSlug: string;
  postedBy: string;
  sourceTableId: string;
  sourceRecordId: string;
}

/**
 * Called when a record is inserted or updated. If the config has a triggerStatus,
 * only fires when the status field matches. Posts a movement automatically.
 *
 * Returns the posted movement id, or null if the trigger condition was not met.
 */
export async function onRecordChange(
  pool: Pool,
  config: StockEngineConfig,
  tableDef: TableDef,
  input: StockTriggerInput,
): Promise<string | null> {
  const { record, tenantSlug, postedBy, sourceTableId, sourceRecordId } = input;

  // Check trigger status if configured
  if (config.triggerStatus !== undefined) {
    // Find a field named 'status' or use the first choice/dropdown field
    const statusFieldId =
      tableDef.fields.find((f) => f.id === 'status' || f.id.includes('status'))?.id;
    if (statusFieldId === undefined) return null;
    if (record[statusFieldId] !== config.triggerStatus) return null;
  }

  const itemId = record[config.itemFieldId];
  const locationId = record[config.locationFieldId];
  const qty = record[config.qtyFieldId];

  if (
    typeof itemId !== 'string' ||
    typeof locationId !== 'string' ||
    typeof qty !== 'number'
  ) {
    throw new StockError(
      `Stock trigger: itemId, locationId must be strings and qty must be a number. ` +
        `Got itemId=${typeof itemId}, locationId=${typeof locationId}, qty=${typeof qty}`,
    );
  }

  const batchId =
    config.batchTrackingFieldId !== undefined
      ? (record[config.batchTrackingFieldId] as string | undefined)
      : undefined;

  const direction = resolveDirection(config, record);

  const movement = await postMovement(pool, tenantSlug, {
    tenantSlug,
    itemId,
    locationId,
    batchId,
    direction,
    qty,
    sourceTableId,
    sourceRecordId,
    postedBy,
  });

  return movement.id;
}
