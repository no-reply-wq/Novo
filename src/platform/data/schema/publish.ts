/**
 * Schema publisher — turns an AppDefinition into real Postgres DDL.
 *
 * publishApp():
 *   1. Loads the current schema from the DB — ONLY the physical tables the
 *      builder owns for this app (`ct_<slug>` tables listed in the app's
 *      definition / `_tables` registry).  System tables (`users`, `roles`,
 *      `_tables`, `_fields`, ERP tables, …) are never introspected and can
 *      therefore never appear in a diff, let alone be dropped.
 *   2. Diffs it against the new AppDefinition.
 *   3. Runs minimal ALTER TABLE / CREATE TABLE DDL inside a single transaction.
 *   4. Enables and forces RLS on every created builder table.
 *   5. Optionally runs an `afterSteps` callback on the SAME client, inside the
 *      SAME transaction, before COMMIT (e.g. bumping `_tables.schema_version`)
 *      — so no state is ever written after the DDL has committed.
 *   6. Returns { migrations, warnings }.
 *
 * SAFETY: applyStep() refuses to touch any table whose name does not start
 * with `ct_` or `_jn_` (hard guard, throws SchemaPublishError).  Even a buggy
 * diff can never drop or alter a system table.
 */

import { Pool, PoolClient } from 'pg';
import type { AppDefinition, TableDef, FieldDef } from '@/platform/contracts';
import {
  diffSchema,
  MigrationStep,
  physicalTableName,
  isBuilderOwnedTable,
  BUILDER_TABLE_PREFIX,
  JUNCTION_TABLE_PREFIX,
} from './diff';
import { fieldToDdlColumn, needsIndex } from './ddl';
import { SchemaPublishError } from '../errors';

export interface PublishResult {
  migrations: MigrationStep[];
  warnings: string[];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function publishApp(
  pool: Pool,
  tenantSlug: string,
  appDef: AppDefinition,
  /**
   * Optional callback run on the same client, inside the same transaction,
   * AFTER all DDL steps and BEFORE COMMIT.  Use it for registry bookkeeping
   * (e.g. bumping `_tables.schema_version`) so that either everything commits
   * together or everything rolls back together.
   */
  afterSteps?: (client: PoolClient) => Promise<void>,
): Promise<PublishResult> {
  const schemaName = `tenant_${tenantSlug}`;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Load current schema — scoped STRICTLY to builder-owned tables.
    const current = await loadCurrentSchema(client, schemaName, appDef);

    // 2. Diff
    const diff = diffSchema(current, appDef.tables);

    // 3. Apply DDL steps (each step is hard-guarded to ct_*/_jn_* targets)
    for (const step of diff.steps) {
      await applyStep(client, schemaName, step, appDef.tables);
    }

    // 4. Registry bookkeeping inside the same transaction — never after COMMIT.
    if (afterSteps) {
      await afterSteps(client);
    }

    await client.query('COMMIT');
    return { migrations: diff.steps, warnings: diff.warnings };
  } catch (err) {
    await client.query('ROLLBACK');
    throw new SchemaPublishError(
      `Schema publish failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    client.release();
  }
}

// ─── Load current schema ──────────────────────────────────────────────────────

/**
 * Reconstructs minimal TableDef[] from information_schema so we can diff.
 *
 * SCOPED LOADING: we only introspect the physical tables the builder owns for
 * THIS app — i.e. `ct_<slug>` for every slug that appears in the app
 * definition or in the schema's `_tables` registry for this app id.  No other
 * table in the tenant schema is ever read into the diff, so system/ERP tables
 * can never be diffed against the app definition (and thus never dropped).
 *
 * Returned TableDefs carry the logical slug in `apiKey` (diff matching key)
 * and the PHYSICAL table name (`ct_<slug>`) in `name`/`id`.
 *
 * Field identity for diffing: the field id stored as the column comment when
 * publish added the column; otherwise, if the app definition has a field with
 * the same apiKey (column name), that field's id — this covers columns created
 * directly by the builder fields route (which sets no comment) without
 * spuriously dropping and re-adding them.  Otherwise the column name itself.
 */
async function loadCurrentSchema(
  client: PoolClient,
  schemaName: string,
  appDef: AppDefinition,
): Promise<TableDef[]> {
  // Ensure schema exists
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS ${ident(schemaName)}`,
  );

  // Builder-owned slugs for this app: from the app definition…
  const ownedSlugs = new Set(appDef.tables.map(t => t.apiKey));

  // …plus the `_tables` registry (covers tables removed from the definition
  // whose physical `ct_` table still exists and should be droppable).
  const regRes = await client.query<{ ok: boolean }>(
    `SELECT to_regclass(quote_ident($1) || '._tables') IS NOT NULL AS ok`,
    [schemaName],
  );
  if (regRes.rows[0]?.ok && appDef.id) {
    const slugRes = await client.query<{ slug: string }>(
      `SELECT slug FROM ${ident(schemaName)}._tables WHERE app_id = $1`,
      [appDef.id],
    );
    for (const row of slugRes.rows) ownedSlugs.add(row.slug);
  }

  if (ownedSlugs.size === 0) return [];

  // Map physical name (ct_<slug>) → slug, and introspect ONLY those tables.
  const physicalBySlug = new Map<string, string>(); // physical → slug
  for (const slug of ownedSlugs) {
    physicalBySlug.set(physicalTableName(slug), slug);
  }

  const tablesRes = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($2::text[])
      ORDER BY table_name`,
    [schemaName, Array.from(physicalBySlug.keys())],
  );

  const tables: TableDef[] = [];

  for (const row of tablesRes.rows) {
    const physical = row.table_name;
    const slug = physicalBySlug.get(physical);
    if (!slug || !isBuilderOwnedTable(physical)) continue; // paranoia: never diff non-builder tables

    const nextTable = appDef.tables.find(t => t.apiKey === slug);

    const colsRes = await client.query<{
      column_name: string;
      udt_name: string;
      column_default: string | null;
      col_description: string | null;
    }>(
      `SELECT
         c.column_name,
         c.udt_name,
         c.column_default,
         pg_catalog.col_description(
           (quote_ident($1) || '.' || quote_ident(c.table_name))::regclass::oid,
           c.ordinal_position
         ) AS col_description
       FROM information_schema.columns c
      WHERE c.table_schema = $1
        AND c.table_name   = $2
      ORDER BY c.ordinal_position`,
      [schemaName, physical],
    );

    const fields: FieldDef[] = colsRes.rows
      .filter(c => !SYSTEM_COLUMNS.has(c.column_name))
      .map((c, i): FieldDef => ({
        // Field id: column comment (set by publish) → registry field with the
        // same apiKey (column created by the fields route) → column name.
        id:
          c.col_description ??
          nextTable?.fields.find(f => f.apiKey === c.column_name)?.id ??
          c.column_name,
        tableId: nextTable?.id ?? physical,
        name: c.column_name,
        apiKey: c.column_name,
        type: 'text', // placeholder — only id matters for diff
        rank: i,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

    tables.push({
      id: nextTable?.id ?? physical,
      appId: appDef.id,
      name: physical,   // PHYSICAL name — diff drop targets come from here
      apiKey: slug,     // logical slug — diff matching key
      fields,
      relations: [],
      schemaVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return tables;
}

const SYSTEM_COLUMNS = new Set([
  'id', 'deleted_at', 'deleted_by', 'delete_reason',
  '_version', '_created_at', '_created_by', '_updated_at', '_updated_by',
  // ct_ tables created by the builder tables route use these system columns:
  'created_at', 'updated_at',
]);

// ─── Hard safety guard ────────────────────────────────────────────────────────

/** Table names publish must NEVER touch, whatever the diff says. */
function assertBuilderOwned(tableName: string, kind: MigrationStep['kind']): void {
  if (!isBuilderOwnedTable(tableName)) {
    throw new SchemaPublishError(
      `Refused ${kind} on table "${tableName}": publish may only touch builder-owned ` +
      `tables (prefix "${BUILDER_TABLE_PREFIX}" or "${JUNCTION_TABLE_PREFIX}"). ` +
      `System tables are never modified by publish.`,
      kind,
    );
  }
}

/** The table a migration step targets. */
function stepTarget(step: MigrationStep): string {
  switch (step.kind) {
    case 'create_junction':
    case 'drop_junction':
      return step.junctionTable;
    default:
      return step.tableName;
  }
}

// ─── Apply a single migration step ───────────────────────────────────────────

export async function applyStep(
  client: PoolClient,
  schemaName: string,
  step: MigrationStep,
  allTables: TableDef[],
): Promise<void> {
  // DEFENSE IN DEPTH: no step — destructive or not — may ever target a table
  // the builder does not own.  This throws before any SQL is run, so even a
  // future diff bug can never drop or alter `users`, `roles`, `_tables`,
  // `_fields` or any other system/ERP table.
  assertBuilderOwned(stepTarget(step), step.kind);

  const s = ident(schemaName);

  switch (step.kind) {
    case 'create_table': {
      const tbl = ident(step.tableName);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${s}.${tbl} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          _version        INT          NOT NULL DEFAULT 0,
          _created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
          _created_by     UUID,
          _updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
          _updated_by     UUID,
          deleted_at      TIMESTAMPTZ,
          deleted_by      UUID,
          delete_reason   TEXT
        )
      `);
      break;
    }

    case 'enable_rls': {
      const tbl = ident(step.tableName);
      await client.query(
        `ALTER TABLE ${s}.${tbl} ENABLE ROW LEVEL SECURITY`,
      );
      await client.query(
        `ALTER TABLE ${s}.${tbl} FORCE ROW LEVEL SECURITY`,
      );
      // Add a default permissive policy so the platform API (which does its
      // own application-level auth) can still read/write rows.  Named with a
      // "novo_default_" prefix so the access-rules engine can drop/replace it
      // when explicit table-level rules are later configured.
      const policyName = `novo_default_allow_${step.tableName.replace(/[^a-z0-9_]/g, '_')}`;
      await client.query(
        `DO $$ BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_policies
             WHERE schemaname = '${schemaName}' AND tablename = '${step.tableName}'
               AND policyname = '${policyName}'
           ) THEN
             EXECUTE 'CREATE POLICY ${policyName} ON ${s}.${tbl} FOR ALL USING (true) WITH CHECK (true)';
           END IF;
         END $$`,
      );
      break;
    }

    case 'add_column': {
      const field = step.field;
      const col = fieldToDdlColumn(field);
      if (!col) break; // virtual / junction

      const tbl = ident(step.tableName);
      const colIdent = ident(col.name);

      let colDef = `${colIdent} ${col.pgType}`;
      if (col.notNull && !col.unique) colDef += ' NOT NULL DEFAULT ' + pgDefault(field);
      if (col.unique) colDef += ' UNIQUE';

      if (col.referencesTable) {
        // Resolve the referenced builder table from allTables by id, then map
        // to its PHYSICAL name (ct_<slug>) — the same table publish creates
        // and the fields route alters.
        const refTable = allTables.find(t => t.id === col.referencesTable);
        const refName = physicalTableName(refTable ? refTable.apiKey : col.referencesTable);
        colDef += ` REFERENCES ${ident(schemaName)}.${ident(refName)}(id) ON DELETE ${col.referencesOnDelete ?? 'RESTRICT'}`;
      }

      await client.query(
        `ALTER TABLE ${s}.${tbl} ADD COLUMN IF NOT EXISTS ${colDef}`,
      );

      // Store field id as column comment so we can reconstruct diffs later
      await client.query(
        `COMMENT ON COLUMN ${s}.${tbl}.${colIdent} IS ${literal(field.id)}`,
      );

      // Auto-index for lookup/dropdown/user/location fields
      if (needsIndex(field)) {
        const idxName = ident(`idx_${step.tableName}_${col.name}`);
        await client.query(
          `CREATE INDEX IF NOT EXISTS ${idxName} ON ${s}.${tbl} (${colIdent})`,
        );
      }

      break;
    }

    case 'drop_column': {
      const tbl = ident(step.tableName);
      await client.query(
        `ALTER TABLE ${s}.${tbl} DROP COLUMN IF EXISTS ${ident(step.columnName)}`,
      );
      break;
    }

    case 'drop_table': {
      await client.query(
        `DROP TABLE IF EXISTS ${s}.${ident(step.tableName)} CASCADE`,
      );
      break;
    }

    case 'create_junction': {
      const jt = ident(step.junctionTable);
      const srcCol = ident(step.sourceCol);
      const tgtCol = ident(step.targetCol);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${s}.${jt} (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          ${srcCol}  UUID NOT NULL,
          ${tgtCol}  UUID NOT NULL,
          rank       INT  NOT NULL DEFAULT 0,
          CONSTRAINT ${ident(step.junctionTable + '_uq')} UNIQUE (${srcCol}, ${tgtCol})
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${ident('idx_' + step.junctionTable + '_src')} ON ${s}.${jt} (${srcCol})`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${ident('idx_' + step.junctionTable + '_tgt')} ON ${s}.${jt} (${tgtCol})`,
      );
      break;
    }

    case 'drop_junction': {
      await client.query(
        `DROP TABLE IF EXISTS ${s}.${ident(step.junctionTable)} CASCADE`,
      );
      break;
    }

    case 'add_index': {
      const tbl = ident(step.tableName);
      const idxName = ident(`idx_${step.tableName}_${step.columnName}`);
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${idxName} ON ${s}.${tbl} (${ident(step.columnName)})`,
      );
      break;
    }
  }
}

// ─── SQL helpers ─────────────────────────────────────────────────────────────

/** Quote an identifier safely */
function ident(s: string): string {
  // Postgres identifier quoting: double-quote and escape internal double-quotes
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Quote a literal string */
function literal(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

/** Return a safe SQL DEFAULT for a nullable column of the given field type. */
function pgDefault(f: FieldDef): string {
  switch (f.type) {
    case 'integer':
    case 'decimal':
    case 'currency':
    case 'percent':
    case 'quantity':
    case 'rating':
    case 'duration':
      return '0';
    case 'boolean':
      return "''"; // TEXT 'false'
    case 'date':
    case 'time':
    case 'datetime':
    case 'date_range':
    case 'gps':
    case 'json':
    case 'file':
    case 'image':
    case 'signature':
    case 'barcode':
      return 'NULL';
    default:
      return "''";
  }
}
