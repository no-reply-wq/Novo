/**
 * Pure diff engine: compares current TableDef[] vs next TableDef[] and
 * produces a SchemaDiff describing the minimal set of changes.
 *
 * No I/O, no DB calls.
 *
 * SAFETY CONTRACT
 * ───────────────
 * The builder only ever owns physical tables prefixed `ct_` (one per builder
 * table, named `ct_<slug>`) and junction tables prefixed `_jn_`.  Every step
 * this diff emits targets a physical table name carrying one of those
 * prefixes.  A `drop_table` is NEVER emitted for a table whose physical name
 * is not builder-owned — system tables (`users`, `roles`, `_tables`,
 * `_fields`, ERP tables, …) can never be dropped by a publish, even if they
 * are wrongly handed to this function as "current" schema.
 */

import type { FieldDef, TableDef } from '@/platform/contracts';

// ─── Builder table naming ──────────────────────────────────────────────────────

/** Prefix of every physical table the builder owns (one per builder table). */
export const BUILDER_TABLE_PREFIX = 'ct_';

/** Prefix of every junction table the builder owns (multi-lookup fields). */
export const JUNCTION_TABLE_PREFIX = '_jn_';

/** True when the physical table name is one the builder owns and may modify. */
export function isBuilderOwnedTable(name: string): boolean {
  return name.startsWith(BUILDER_TABLE_PREFIX) || name.startsWith(JUNCTION_TABLE_PREFIX);
}

/**
 * Physical table name for a builder table slug (apiKey).
 * `items` → `ct_items`.  Already-prefixed names pass through unchanged.
 * This matches the naming used by the builder tables/fields routes, which
 * CREATE/ALTER `ct_<slug>` directly.
 */
export function physicalTableName(apiKey: string): string {
  return isBuilderOwnedTable(apiKey) ? apiKey : `${BUILDER_TABLE_PREFIX}${apiKey}`;
}

// ─── Output types ──────────────────────────────────────────────────────────────

export type MigrationStep =
  | { kind: 'create_table';   tableId: string; tableName: string }
  | { kind: 'drop_table';     tableId: string; tableName: string }
  | { kind: 'add_column';     tableId: string; tableName: string; field: FieldDef }
  | { kind: 'drop_column';    tableId: string; tableName: string; fieldId: string; columnName: string }
  | { kind: 'add_index';      tableId: string; tableName: string; fieldId: string; columnName: string }
  | { kind: 'create_junction';tableId: string; junctionTable: string; sourceCol: string; targetCol: string }
  | { kind: 'drop_junction';  junctionTable: string }
  | { kind: 'enable_rls';     tableId: string; tableName: string };

export interface SchemaDiff {
  steps: MigrationStep[];
  warnings: string[];
}

// ─── Main diff function ────────────────────────────────────────────────────────

/**
 * Diffs current schema vs next schema.
 * Both lists use TableDef.apiKey as the stable logical identifier (the slug).
 * Current tables should carry their PHYSICAL name (e.g. `ct_items`) in
 * TableDef.name — that is what loadCurrentSchema produces.
 * FieldDef.id is the stable identifier for columns.
 *
 * All emitted steps use PHYSICAL table names (`ct_<slug>` / `_jn_*`).
 */
export function diffSchema(current: TableDef[], next: TableDef[]): SchemaDiff {
  const steps: MigrationStep[] = [];
  const warnings: string[] = [];

  const currentByKey = new Map(current.map(t => [t.apiKey, t]));
  const nextByKey    = new Map(next.map(t => [t.apiKey, t]));

  // Tables to drop (exist in current, not in next).
  // HARD SAFETY RULE: only builder-owned physical tables (ct_*/_jn_*) may
  // ever be dropped.  A "current" table whose physical name does not carry a
  // builder prefix is skipped with a warning — never dropped.
  for (const [key, table] of currentByKey) {
    if (!nextByKey.has(key)) {
      const physical = table.name && table.name !== key ? table.name : key;
      if (!isBuilderOwnedTable(physical)) {
        warnings.push(
          `Refusing to drop table "${physical}" — it is not a builder-owned (${BUILDER_TABLE_PREFIX}*/${JUNCTION_TABLE_PREFIX}*) table.`,
        );
        continue;
      }
      warnings.push(`Table "${key}" (${physical}) will be dropped — all data will be lost.`);
      steps.push({ kind: 'drop_table', tableId: table.id, tableName: physical });
    }
  }

  // Tables to create or alter
  for (const [key, nextTable] of nextByKey) {
    const currTable = currentByKey.get(key);
    const physical = physicalTableName(key);

    if (!currTable) {
      // New table
      steps.push({ kind: 'create_table', tableId: nextTable.id, tableName: physical });
      steps.push({ kind: 'enable_rls',   tableId: nextTable.id, tableName: physical });
      // All fields are "added" to the new table
      for (const f of nextTable.fields) {
        steps.push({ kind: 'add_column', tableId: nextTable.id, tableName: physical, field: f });
      }
      // Junction tables for multi-lookups
      for (const step of junctionStepsForTable(nextTable)) {
        steps.push(step);
      }
    } else {
      // Existing table: diff fields
      const currFieldById = new Map(currTable.fields.map(f => [f.id, f]));
      const nextFieldById = new Map(nextTable.fields.map(f => [f.id, f]));

      // Dropped fields
      for (const [fid, f] of currFieldById) {
        if (!nextFieldById.has(fid)) {
          warnings.push(
            `Column "${f.apiKey}" on table "${physical}" will be dropped — data in this column will be lost.`,
          );
          steps.push({
            kind: 'drop_column',
            tableId: nextTable.id,
            tableName: physical,
            fieldId: fid,
            columnName: f.apiKey,
          });
        }
      }

      // Added fields (new fields not in current)
      for (const [fid, f] of nextFieldById) {
        if (!currFieldById.has(fid)) {
          steps.push({ kind: 'add_column', tableId: nextTable.id, tableName: physical, field: f });
        }
      }

      // Junction tables: compare by field id
      const currJunctionFieldIds = new Set(
        currTable.fields
          .filter(f => f.type === 'lookup' && isMulti(f))
          .map(f => f.id),
      );
      for (const f of nextTable.fields) {
        if (f.type === 'lookup' && isMulti(f) && !currJunctionFieldIds.has(f.id)) {
          const jname = junctionTableName(key, f.apiKey);
          steps.push({
            kind: 'create_junction',
            tableId: nextTable.id,
            junctionTable: jname,
            sourceCol: `${key}_id`,
            targetCol: `${f.apiKey}_id`,
          });
        }
      }
    }
  }

  return { steps, warnings };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMulti(f: FieldDef): boolean {
  const opts = (f.options ?? {}) as { multi?: boolean };
  return opts.multi === true;
}

function junctionTableName(tableName: string, fieldApiKey: string): string {
  return `${JUNCTION_TABLE_PREFIX}${tableName}_${fieldApiKey}`;
}

function junctionStepsForTable(table: TableDef): MigrationStep[] {
  const steps: MigrationStep[] = [];
  for (const f of table.fields) {
    if (f.type === 'lookup' && isMulti(f)) {
      steps.push({
        kind: 'create_junction',
        tableId: table.id,
        junctionTable: junctionTableName(table.apiKey, f.apiKey),
        sourceCol: `${table.apiKey}_id`,
        targetCol: `${f.apiKey}_id`,
      });
    }
  }
  return steps;
}
