/**
 * Pure diff engine: compares current TableDef[] vs next TableDef[] and
 * produces a SchemaDiff describing the minimal set of changes.
 *
 * No I/O, no DB calls.
 */

import type { FieldDef, TableDef } from '@/platform/contracts';

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
 * Both lists use TableDef.apiKey as the stable identifier for table names.
 * FieldDef.id is the stable identifier for columns.
 */
export function diffSchema(current: TableDef[], next: TableDef[]): SchemaDiff {
  const steps: MigrationStep[] = [];
  const warnings: string[] = [];

  const currentByKey = new Map(current.map(t => [t.apiKey, t]));
  const nextByKey    = new Map(next.map(t => [t.apiKey, t]));

  // Tables to drop (exist in current, not in next)
  for (const [key, table] of currentByKey) {
    if (!nextByKey.has(key)) {
      warnings.push(`Table "${key}" will be dropped — all data will be lost.`);
      steps.push({ kind: 'drop_table', tableId: table.id, tableName: key });
    }
  }

  // Tables to create or alter
  for (const [key, nextTable] of nextByKey) {
    const currTable = currentByKey.get(key);

    if (!currTable) {
      // New table
      steps.push({ kind: 'create_table', tableId: nextTable.id, tableName: key });
      steps.push({ kind: 'enable_rls',   tableId: nextTable.id, tableName: key });
      // All fields are "added" to the new table
      for (const f of nextTable.fields) {
        steps.push({ kind: 'add_column', tableId: nextTable.id, tableName: key, field: f });
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
            `Column "${f.apiKey}" on table "${key}" will be dropped — data in this column will be lost.`,
          );
          steps.push({
            kind: 'drop_column',
            tableId: nextTable.id,
            tableName: key,
            fieldId: fid,
            columnName: f.apiKey,
          });
        }
      }

      // Added fields (new fields not in current)
      for (const [fid, f] of nextFieldById) {
        if (!currFieldById.has(fid)) {
          steps.push({ kind: 'add_column', tableId: nextTable.id, tableName: key, field: f });
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
  return `_jn_${tableName}_${fieldApiKey}`;
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
