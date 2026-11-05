/**
 * Maps FieldDef → Postgres DDL column spec.
 *
 * Rules:
 *  - Computed fields (formula, rollup, lookup_value, status_from_rules) have NO column.
 *  - auto_number is a TEXT NOT NULL UNIQUE column.
 *  - link/lookup single → UUID REFERENCES …, multi → junction table (no column here).
 *  - Everything else follows the type map below.
 */

import type { FieldDef, LookupFieldOptions } from '@/platform/contracts';

export interface DdlColumn {
  name: string;         // the apiKey
  pgType: string;       // e.g. 'TEXT', 'BIGINT', 'NUMERIC(20,6)'
  notNull: boolean;
  unique: boolean;
  defaultExpr?: string; // raw SQL default expression
  referencesTable?: string; // for FK columns
  referencesOnDelete?: string;
}

/** Computed fields that produce no physical column. */
const VIRTUAL_TYPES = new Set([
  'formula',
  'rollup',
  'lookup_value',
  'status_from_rules',
]);

/**
 * Returns the DdlColumn for a FieldDef, or null if the field is virtual
 * (computed) or requires a junction table (multi-lookup).
 */
export function fieldToDdlColumn(f: FieldDef): DdlColumn | null {
  if (VIRTUAL_TYPES.has(f.type)) return null;

  // Multi-select lookup → junction table, no inline column
  if (f.type === 'lookup') {
    const opts = (f.options ?? {}) as LookupFieldOptions;
    if (opts.multi) return null;
    // Single lookup → UUID FK
    const onDelete = opts.cascadeDelete === 'cascade'
      ? 'CASCADE'
      : opts.cascadeDelete === 'set_null'
        ? 'SET NULL'
        : 'RESTRICT';
    return {
      name: f.apiKey,
      pgType: 'UUID',
      notNull: f.required === true,
      unique: f.unique ?? false,
      referencesTable: opts.targetTableId, // resolved to real table name by caller
      referencesOnDelete: onDelete,
    };
  }

  const pgType = resolveType(f);

  if (f.type === 'auto_number') {
    return {
      name: f.apiKey,
      pgType: 'TEXT',
      notNull: true,
      unique: true,
    };
  }

  return {
    name: f.apiKey,
    pgType,
    notNull: f.required === true,
    unique: f.unique ?? false,
  };
}

function resolveType(f: FieldDef): string {
  switch (f.type) {
    // ── Text ──────────────────────────────────────────────────────────────
    case 'text':
    case 'long_text':
    case 'rich_text':
    case 'email':
    case 'phone':
    case 'url':
    case 'password':
      return 'TEXT';

    // ── Number ────────────────────────────────────────────────────────────
    case 'integer':
      return 'BIGINT';
    case 'decimal':
    case 'currency':
    case 'percent':
    case 'quantity':
      return 'NUMERIC(20,6)';

    // ── Date ──────────────────────────────────────────────────────────────
    case 'date':
      return 'DATE';
    case 'time':
      return 'TIME';
    case 'datetime':
      return 'TIMESTAMPTZ';
    case 'date_range':
      return 'JSONB';
    case 'duration':
      return 'BIGINT'; // seconds

    // ── Choice ────────────────────────────────────────────────────────────
    case 'dropdown':
    case 'radio':
    case 'checkbox':
    case 'boolean':
    case 'rating':
    case 'color':
      return 'TEXT';
    case 'multi_select':
      return 'TEXT[]';

    // ── Link ──────────────────────────────────────────────────────────────
    case 'lookup': // single-FK handled by fieldToDdlColumn early-return; here as fallback
    case 'user':
    case 'location':
      return 'UUID';

    // ── Capture ───────────────────────────────────────────────────────────
    case 'file':
    case 'image':
    case 'signature':
    case 'barcode':
    case 'gps':
    case 'json':
      return 'JSONB';

    // ── Computed that have columns ─────────────────────────────────────────
    case 'auto_number':
      return 'TEXT'; // handled above, but keep switch exhaustive

    // ── Virtual computed — no column; caller filters these out first ─────────
    case 'formula':
    case 'rollup':
    case 'lookup_value':
    case 'status_from_rules':
      return 'TEXT'; // unreachable: fieldToDdlColumn returns null before calling resolveType

    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = f.type;
      void _exhaustive;
      return 'TEXT';
    }
  }
}

/** Returns true when this field needs an index (always filtered/sorted). */
export function needsIndex(f: FieldDef): boolean {
  return (
    f.type === 'lookup' ||
    f.type === 'dropdown' ||
    f.type === 'user' ||
    f.type === 'location'
  );
}
