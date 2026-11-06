/**
 * Auto-number engine — data-layer facade.
 *
 * Custom format with:
 *   - Prefix (literal string)
 *   - Year token {YYYY}
 *   - Location token {LOC}
 *   - Sequence token {SEQ:N} where N is zero-pad width
 *
 * Example format: `INV-{YYYY}-{LOC}-{SEQ:4}` → `INV-2026-MUM-0001`
 *
 * Sequence counters live in `public.sequences` and use SELECT … FOR UPDATE
 * for atomic increment (no gaps, no duplicates even under concurrent inserts).
 *
 * Reset rules: 'never' | 'yearly' | 'monthly'
 * On reset-period rollover the counter restarts at 1.
 */

import type { PoolClient } from 'pg';
import type { AutoNumberOptions } from '@/platform/contracts';
import { NotConfiguredError } from './errors';

// ─── Format token types ───────────────────────────────────────────────────────

type FormatToken =
  | { kind: 'literal'; text: string }
  | { kind: 'year' }
  | { kind: 'location' }
  | { kind: 'seq'; width: number };

// ─── Format parser ────────────────────────────────────────────────────────────

/**
 * Parse an auto-number format string into an ordered list of tokens.
 *
 * Supported tokens:
 *   {YYYY}    → 4-digit year
 *   {LOC}     → location code (passed at runtime)
 *   {SEQ}     → sequence number, default padding 4
 *   {SEQ:N}   → sequence number with N-digit zero-padding
 *
 * Everything else is treated as a literal.
 *
 * @example
 * parseFormatString('INV-{YYYY}-{LOC}-{SEQ:4}')
 * // → [literal:'INV-', year, literal:'-', location, literal:'-', seq:4]
 */
export function parseFormatString(fmt: string): FormatToken[] {
  const tokens: FormatToken[] = [];
  let i = 0;
  let literal = '';

  while (i < fmt.length) {
    if (fmt[i] === '{') {
      const end = fmt.indexOf('}', i);
      if (end === -1) {
        // Unclosed brace — treat rest as literal
        literal += fmt.slice(i);
        break;
      }
      if (literal) {
        tokens.push({ kind: 'literal', text: literal });
        literal = '';
      }
      const tag = fmt.slice(i + 1, end).toUpperCase();
      if (tag === 'YYYY') {
        tokens.push({ kind: 'year' });
      } else if (tag === 'LOC') {
        tokens.push({ kind: 'location' });
      } else if (tag === 'SEQ') {
        tokens.push({ kind: 'seq', width: 4 });
      } else if (tag.startsWith('SEQ:')) {
        const w = parseInt(tag.slice(4), 10);
        tokens.push({ kind: 'seq', width: Number.isFinite(w) && w > 0 ? w : 4 });
      } else {
        // Unknown token — emit as literal
        tokens.push({ kind: 'literal', text: `{${fmt.slice(i + 1, end)}}` });
      }
      i = end + 1;
    } else {
      literal += fmt[i];
      i++;
    }
  }

  if (literal) {
    tokens.push({ kind: 'literal', text: literal });
  }

  return tokens;
}

// ─── Format renderer ──────────────────────────────────────────────────────────

/**
 * Render a parsed format token list into a string given a sequence number,
 * optional location code, and date.
 */
export function renderFormat(
  tokens: FormatToken[],
  seq: number,
  locationCode: string | undefined,
  now: Date,
): string {
  return tokens.map(token => {
    switch (token.kind) {
      case 'literal':  return token.text;
      case 'year':     return String(now.getFullYear());
      case 'location': return locationCode ?? '';
      case 'seq':      return String(seq).padStart(token.width, '0');
    }
  }).join('');
}

// ─── Options → format string ──────────────────────────────────────────────────

/**
 * Build a format string from AutoNumberOptions.
 *
 * When `options.format` is provided it is used directly.
 * Otherwise the format is inferred from the boolean flags.
 */
export function optionsToFormatString(options: AutoNumberOptions): string {
  // If a full format string is stored, use it
  const raw = (options as AutoNumberOptions & { format?: string }).format;
  if (raw) return raw;

  // Build from flags
  // If the prefix already ends with a separator, join remaining parts with '-'
  // but don't add an extra separator between prefix and next token.
  const prefix = options.prefix ?? '';
  const suffixParts: string[] = [];
  if (options.includeYear) suffixParts.push('{YYYY}');
  if (options.includeLocation) suffixParts.push('{LOC}');
  const width = options.padding ?? 4;
  suffixParts.push(`{SEQ:${width}}`);

  if (!prefix) {
    return suffixParts.join('-');
  }

  // Check if prefix already ends with a separator character
  const endsWithSep = /[-_/|.]$/.test(prefix);
  const separator = endsWithSep ? '' : '-';
  return prefix + separator + suffixParts.join('-');
}

// ─── Reset key ────────────────────────────────────────────────────────────────

function buildResetKey(rule: AutoNumberOptions['resetRule'], now: Date): string {
  if (rule === 'yearly') return String(now.getFullYear());
  if (rule === 'monthly') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return 'never';
}

// ─── Sequence increment ───────────────────────────────────────────────────────

/**
 * Atomically increment the sequence counter and return the next value.
 *
 * MUST be called inside an open transaction (FOR UPDATE requires it).
 *
 * @param client     - Postgres pool client (inside a transaction)
 * @param tableId    - stable UUID of the table
 * @param formatKey  - stable key identifying this sequence (usually field id)
 * @param resetRule  - reset period (never / yearly / monthly)
 * @param now        - current time (injected for testability)
 */
async function incrementSequence(
  client: PoolClient,
  tableId: string,
  formatKey: string,
  resetRule: AutoNumberOptions['resetRule'],
  now: Date,
): Promise<number> {
  const resetKey = buildResetKey(resetRule, now);

  // Upsert the sequence row (noop if exists)
  await client.query(
    `INSERT INTO platform.auto_number_sequences
       (table_id, format_key, last_value, reset_period, reset_at)
     VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (table_id, format_key) DO NOTHING`,
    [tableId, formatKey, resetRule ?? 'never', now],
  );

  // Lock the row
  const lockRes = await client.query<{
    id: string;
    last_value: string;
    reset_period: string | null;
    reset_at: Date | null;
  }>(
    `SELECT id, last_value, reset_period, reset_at
       FROM platform.auto_number_sequences
      WHERE table_id = $1 AND format_key = $2
      FOR UPDATE`,
    [tableId, formatKey],
  );

  const row = lockRes.rows[0];
  if (!row) throw new Error(`auto_number_sequences row missing for ${tableId}/${formatKey}`);

  const currentVal = parseInt(String(row.last_value), 10);

  // Determine if we need to reset based on period
  const prevResetKey = buildResetKey(
    (row.reset_period ?? 'never') as AutoNumberOptions['resetRule'],
    row.reset_at ?? now,
  );

  let nextVal: number;
  if (resetRule !== 'never' && prevResetKey !== resetKey) {
    // Period has rolled over — reset to 1
    nextVal = 1;
  } else {
    nextVal = currentVal + 1;
  }

  await client.query(
    `UPDATE platform.auto_number_sequences
        SET last_value = $3, reset_at = $4
      WHERE table_id = $1 AND format_key = $2`,
    [tableId, formatKey, nextVal, now],
  );

  return nextVal;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the next auto-number for a table+field combination.
 *
 * MUST be called inside an open transaction.
 *
 * @param client       - Postgres pool client (inside a transaction)
 * @param tableId      - stable UUID of the table (from platform DB)
 * @param fieldId      - stable UUID of the auto_number field
 * @param options      - AutoNumberOptions (prefix, year, location, padding, resetRule)
 * @param locationCode - optional location code for {LOC} token
 * @param now          - optional fixed timestamp (for tests / audit)
 */
export async function nextAutoNumberFormatted(
  client: PoolClient,
  tableId: string,
  fieldId: string,
  options: AutoNumberOptions,
  locationCode?: string,
  now: Date = new Date(),
): Promise<string> {
  if (!tableId) throw new NotConfiguredError('auto_number.tableId');

  const formatKey = options.sequenceId ?? `field:${fieldId}`;
  const resetRule = options.resetRule ?? 'never';

  const seq = await incrementSequence(client, tableId, formatKey, resetRule, now);

  const fmtStr = optionsToFormatString(options);
  const tokens = parseFormatString(fmtStr);
  return renderFormat(tokens, seq, locationCode, now);
}

/**
 * Preview the next auto-number format without consuming a sequence slot.
 * Useful for the builder UI to show users what the format looks like.
 */
export function previewAutoNumber(
  options: AutoNumberOptions,
  seq: number = 1,
  locationCode?: string,
  now: Date = new Date(),
): string {
  const fmtStr = optionsToFormatString(options);
  const tokens = parseFormatString(fmtStr);
  return renderFormat(tokens, seq, locationCode, now);
}
