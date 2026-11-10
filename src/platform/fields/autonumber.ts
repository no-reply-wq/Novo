/**
 * Auto-number generator — tenant-aware wrapper over the platform sequences table.
 *
 * Format: {prefix}-{YYYY}-{location}-{pad(seq,4)}
 * Each component is optional. Reset rule: 'never' | 'yearly' | 'monthly'.
 * Uses SELECT ... FOR UPDATE for atomic sequence increment.
 *
 * This module delegates to the existing platform data/autonumber.ts but wraps
 * it with the tenant-aware API expected by Agent N's field layer.
 */

import { PoolClient } from 'pg';
import {
  nextAutoNumber as platformNextAutoNumber,
  formatAutoNumber,
} from '@/platform/data/auto-number';
import type { AutoNumberField } from './types';

export { formatAutoNumber };

/**
 * Allocate the next auto-number for a field.
 *
 * Must be called inside a transaction (FOR UPDATE requires it).
 *
 * @param fieldDef    - the auto_number field definition
 * @param tenantSlug  - tenant identifier (used as app_id in sequences table)
 * @param db          - Postgres client (inside a transaction)
 * @param locationCode - optional location code for location-based sequences
 * @param now         - optional fixed timestamp (useful for testing)
 * @returns formatted auto-number string
 */
export async function nextAutoNumber(
  fieldDef: AutoNumberField,
  tenantSlug: string,
  db: PoolClient,
  locationCode?: string,
  now: Date = new Date(),
): Promise<string> {
  const opts = fieldDef.options;

  // The sequence ID is scoped to tenant + field, or uses the shared sequenceId
  const sequenceId = opts.sequenceId ?? `field:${fieldDef.id}`;

  return platformNextAutoNumber(
    db,
    tenantSlug,
    sequenceId,
    opts,
    locationCode,
    now,
  );
}
