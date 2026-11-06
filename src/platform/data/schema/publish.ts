/**
 * Schema publisher — turns an AppDefinition into real Postgres DDL.
 *
 * publishApp():
 *   1. Loads the current schema from the DB (via information_schema).
 *   2. Diffs it against the new AppDefinition.
 *   3. Runs minimal ALTER TABLE / CREATE TABLE DDL inside a single transaction.
 *   4. Enables and forces RLS on every tenant table.
 *   5. Returns { migrations, warnings }.
 */

import { Pool, PoolClient } from 'pg';
import type { AppDefinition, TableDef, FieldDef, LookupFieldOptions } from '@/platform/contracts';
import { diffSchema, MigrationStep, SchemaDiff } from './diff';
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
): Promise<PublishResult> {
  const schemaName = `tenant_${tenantSlug}`;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Load current schema from information_schema
    const current = await loadCurrentSchema(client, schemaName);

    // 2. Diff
    const diff = diffSchema(current, appDef.tables);

    // 3. Apply DDL steps
    for (const step of diff.steps) {
      await applyStep(client, schemaName, step, appDef.tables);
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
 * We only need table names and field ids (stored as column comment) to detect
 * added/removed fields. apiKey is the column name.
 */
async function loadCurrentSchema(client: PoolClient, schemaName: string): Promise<TableDef[]> {
  // Ensure schema exists
  await client.query(
    `CREATE SCHEMA IF NOT EXISTS ${ident(schemaName)}`,
  );

  const tablesRes = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [schemaName],
  );

  const tables: TableDef[] = [];

  for (const row of tablesRes.rows) {
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
      [schemaName, row.table_name],
    );

    const fields: FieldDef[] = colsRes.rows
      .filter(c => !SYSTEM_COLUMNS.has(c.column_name))
      .map((c, i): FieldDef => ({
        id: c.col_description ?? c.column_name, // We store field id as column comment
        tableId: row.table_name,
        name: c.column_name,
        apiKey: c.column_name,
        type: 'text', // placeholder — only id matters for diff
        rank: i,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

    tables.push({
      id: row.table_name,
      appId: '',
      name: row.table_name,
      apiKey: row.table_name,
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
]);

// ─── Apply a single migration step ───────────────────────────────────────────

async function applyStep(
  client: PoolClient,
  schemaName: string,
  step: MigrationStep,
  allTables: TableDef[],
): Promise<void> {
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
        // Resolve table name from allTables by id
        const refTable = allTables.find(t => t.id === col.referencesTable);
        const refName = refTable ? refTable.apiKey : col.referencesTable;
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
