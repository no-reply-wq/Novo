/**
 * Auto-number generator.
 *
 * Uses public.sequences with SELECT … FOR UPDATE to guarantee gap-free
 * sequential numbers even under concurrent inserts.
 *
 * Format: {prefix}{YYYY-?}{LOCATION-?}{seq:padding}
 */

import { PoolClient } from 'pg';
import type { AutoNumberOptions } from '@/platform/contracts';

/**
 * Returns the next formatted auto-number and increments the counter.
 *
 * Must be called inside an open transaction (the FOR UPDATE lock requires it).
 */
export async function nextAutoNumber(
  client: PoolClient,
  appId: string,
  sequenceId: string,
  options: AutoNumberOptions,
  locationCode?: string,
  now: Date = new Date(),
): Promise<string> {
  const resetRule = options.resetRule ?? 'never';
  const resetKey  = buildResetKey(resetRule, now);

  // Upsert row; if the reset key changed, restart the counter at 0
  await client.query(
    `INSERT INTO public.sequences (app_id, sequence_id, counter, reset_rule, reset_key)
     VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (app_id, sequence_id) DO NOTHING`,
    [appId, sequenceId, resetRule, resetKey],
  );

  // Check whether the reset key has rolled over
  const checkRes = await client.query<{ reset_key: string; counter: number }>(
    `SELECT reset_key, counter FROM public.sequences
      WHERE app_id = $1 AND sequence_id = $2
      FOR UPDATE`,
    [appId, sequenceId],
  );

  const existing = checkRes.rows[0];
  // pg returns BIGINT columns as strings — parse explicitly
  const currentCounter = parseInt(String(existing.counter), 10);
  let newCounter: number;

  if (existing.reset_key !== resetKey) {
    // Period rolled over — reset to 1
    newCounter = 1;
    await client.query(
      `UPDATE public.sequences
          SET counter   = 1,
              reset_key = $3
        WHERE app_id = $1 AND sequence_id = $2`,
      [appId, sequenceId, resetKey],
    );
  } else {
    newCounter = currentCounter + 1;
    await client.query(
      `UPDATE public.sequences SET counter = $3
        WHERE app_id = $1 AND sequence_id = $2`,
      [appId, sequenceId, newCounter],
    );
  }

  return formatAutoNumber(newCounter, options, locationCode, now);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatAutoNumber(
  seq: number,
  options: AutoNumberOptions,
  locationCode?: string,
  now: Date = new Date(),
): string {
  const padding = options.padding ?? 4;
  const parts: string[] = [];

  if (options.prefix) parts.push(options.prefix);
  if (options.includeYear)     parts.push(String(now.getFullYear()));
  if (options.includeLocation && locationCode) parts.push(locationCode);

  parts.push(String(seq).padStart(padding, '0'));

  // If there was a prefix, join with nothing (prefix already has separator).
  // Otherwise use '-' between parts.
  if (options.prefix) {
    // prefix already includes trailing separator if the caller wants one,
    // but to be predictable we join the remaining parts with '-'
    return options.prefix + parts.slice(1).join('-');
  }
  return parts.join('-');
}

function buildResetKey(rule: AutoNumberOptions['resetRule'], now: Date): string {
  if (rule === 'yearly')  return String(now.getFullYear());
  if (rule === 'monthly') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return 'never'; // 'never' — single ever-incrementing key
}
