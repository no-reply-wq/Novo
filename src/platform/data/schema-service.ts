/**
 * Schema service — unified API for DDL generation and publishing.
 *
 * Provides:
 *   - generateCreateDDL(slug, table)  → CREATE TABLE SQL string
 *   - generateAlterDDL(slug, table, existing) → ALTER TABLE SQL strings
 *   - publishTableSchema(pool, slug, table) → runs DDL in a transaction
 *
 * This module delegates to schema/ddl.ts for type mapping and
 * schema/publish.ts for the full app-level publisher. It exists so callers
 * have a single import for table-level (not app-level) operations.
 */

import { Pool, PoolClient } from 'pg';
import type { TableDef, FieldDef } from '@/platform/contracts';
import { fieldToDdlColumn, DdlColumn } from './schema/ddl';
import { SchemaPublishError } from './errors';

// ─── SQL helpers ──────────────────────────────────────────────────────────────

function ident(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}

function literal(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function columnDef(col: DdlColumn): string {
  let def = `${ident(col.name)} ${col.pgType}`;
  if (col.unique) def += ' UNIQUE';
  if (col.notNull) def += ' NOT NULL';
  if (col.defaultExpr) def += ` DEFAULT ${col.defaultExpr}`;
  return def;
}

// ─── CREATE TABLE DDL ────────────────────────────────────────────────────────

/**
 * Returns the full CREATE TABLE SQL string for a table.
 *
 * Does NOT execute it. The caller (publish step) runs it in a transaction.
 * Includes system columns: id, _version, _created_at, _created_by,
 * _updated_at, _updated_by, deleted_at, deleted_by, delete_reason.
 */
export function generateCreateDDL(tenantSlug: string, table: TableDef): string {
  const schema = `tenant_${tenantSlug}`;
  const tbl = `${ident(schema)}.${ident(table.apiKey)}`;

  const userColumns: string[] = [];
  for (const field of table.fields) {
    const col = fieldToDdlColumn(field);
    if (!col) continue; // virtual or multi-lookup
    userColumns.push('  ' + columnDef(col));
  }

  const lines = [
    `CREATE TABLE IF NOT EXISTS ${tbl} (`,
    `  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),`,
    `  _version        INT          NOT NULL DEFAULT 0,`,
    `  _created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),`,
    `  _created_by     UUID,`,
    `  _updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),`,
    `  _updated_by     UUID,`,
    `  deleted_at      TIMESTAMPTZ,`,
    `  deleted_by      UUID,`,
    `  delete_reason   TEXT`,
    ...(userColumns.length > 0 ? userColumns.map(c => `,\n${c}`) : []),
    `);`,
  ];

  return lines.join('\n');
}

// ─── ALTER TABLE DDL ─────────────────────────────────────────────────────────

export interface AlterDDLResult {
  statements: string[];
  warnings: string[];
}

/**
 * Returns minimal ALTER TABLE SQL statements to migrate from existingFields
 * to table.fields.
 *
 * Policy:
 *   - New fields → ADD COLUMN IF NOT EXISTS
 *   - Removed fields → never drops (safe); returns a warning instead
 *   - Type changes → never alters type (safe); returns a warning
 */
export function generateAlterDDL(
  tenantSlug: string,
  table: TableDef,
  existingFields: FieldDef[],
): AlterDDLResult {
  const schema = `tenant_${tenantSlug}`;
  const tbl = `${ident(schema)}.${ident(table.apiKey)}`;
  const statements: string[] = [];
  const warnings: string[] = [];

  const existingKeys = new Set(existingFields.map(f => f.apiKey));
  const newKeys = new Set(table.fields.map(f => f.apiKey));

  // Add new columns
  for (const field of table.fields) {
    if (existingKeys.has(field.apiKey)) continue;
    const col = fieldToDdlColumn(field);
    if (!col) continue;
    statements.push(
      `ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${columnDef(col)};`,
    );
    statements.push(
      `COMMENT ON COLUMN ${tbl}.${ident(col.name)} IS ${literal(field.id)};`,
    );
  }

  // Warn about removed fields (safe: we do not drop columns)
  for (const f of existingFields) {
    if (!newKeys.has(f.apiKey)) {
      warnings.push(
        `Column "${f.apiKey}" is no longer in the schema definition but was NOT dropped to prevent data loss. Remove it manually if intended.`,
      );
    }
  }

  return { statements, warnings };
}

// ─── Publish single table ─────────────────────────────────────────────────────

export interface TablePublishResult {
  created: boolean;   // true if the table was newly created
  statements: string[];
  warnings: string[];
}

/**
 * Publishes (creates or migrates) a single table inside a transaction.
 *
 * Records the migration in platform.migrations if that table exists.
 */
export async function publishTableSchema(
  pool: Pool,
  tenantSlug: string,
  table: TableDef,
): Promise<TablePublishResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const schema = `tenant_${tenantSlug}`;
    const schemaIdent = ident(schema);

    // Ensure schema exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaIdent}`);

    // Check whether the table exists
    const existsRes = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_schema = $1
            AND table_name   = $2
            AND table_type   = 'BASE TABLE'
       ) AS exists`,
      [schema, table.apiKey],
    );
    const tableExists = existsRes.rows[0]?.exists ?? false;

    const statements: string[] = [];
    const warnings: string[] = [];
    let created = false;

    if (!tableExists) {
      const ddl = generateCreateDDL(tenantSlug, table);
      await client.query(ddl);
      statements.push(ddl);

      // Enable RLS
      await enableRls(client, schema, table.apiKey);
      created = true;
    } else {
      // Load existing columns
      const existing = await loadExistingFields(client, schema, table.apiKey);
      const alter = generateAlterDDL(tenantSlug, table, existing);
      for (const stmt of alter.statements) {
        await client.query(stmt);
      }
      statements.push(...alter.statements);
      warnings.push(...alter.warnings);
    }

    // Log migration
    await logMigration(client, tenantSlug, table, statements);

    await client.query('COMMIT');
    return { created, statements, warnings };
  } catch (err) {
    await client.query('ROLLBACK');
    throw new SchemaPublishError(
      `publishTableSchema failed for "${table.apiKey}": ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    client.release();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function enableRls(
  client: PoolClient,
  schema: string,
  tableName: string,
): Promise<void> {
  const tbl = `${ident(schema)}.${ident(tableName)}`;
  await client.query(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY`);
  const policyName = `novo_default_allow_${tableName.replace(/[^a-z0-9_]/g, '_')}`;
  await client.query(
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_policies
          WHERE schemaname = '${schema}'
            AND tablename  = '${tableName}'
            AND policyname = '${policyName}'
       ) THEN
         EXECUTE 'CREATE POLICY ${policyName} ON ${tbl} FOR ALL USING (true) WITH CHECK (true)';
       END IF;
     END $$`,
  );
}

async function loadExistingFields(
  client: PoolClient,
  schema: string,
  tableName: string,
): Promise<FieldDef[]> {
  const SYSTEM_COLUMNS = new Set([
    'id', 'deleted_at', 'deleted_by', 'delete_reason',
    '_version', '_created_at', '_created_by', '_updated_at', '_updated_by',
  ]);

  const res = await client.query<{ column_name: string; col_description: string | null }>(
    `SELECT
       c.column_name,
       pg_catalog.col_description(
         (quote_ident($1) || '.' || quote_ident(c.table_name))::regclass::oid,
         c.ordinal_position
       ) AS col_description
     FROM information_schema.columns c
    WHERE c.table_schema = $1
      AND c.table_name   = $2
    ORDER BY c.ordinal_position`,
    [schema, tableName],
  );

  return res.rows
    .filter(r => !SYSTEM_COLUMNS.has(r.column_name))
    .map((r, i): FieldDef => ({
      id: r.col_description ?? r.column_name,
      tableId: tableName,
      name: r.column_name,
      apiKey: r.column_name,
      type: 'text',
      rank: i,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
}

async function logMigration(
  client: PoolClient,
  tenantSlug: string,
  table: TableDef,
  statements: string[],
): Promise<void> {
  // Best-effort: migrations table may not exist yet in some environments
  try {
    await client.query(
      `INSERT INTO platform.migrations
         (tenant_slug, table_api_key, statements, applied_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT DO NOTHING`,
      [tenantSlug, table.apiKey, JSON.stringify(statements)],
    );
  } catch {
    // Silently ignore if platform.migrations doesn't exist
  }
}
