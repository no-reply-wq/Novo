/**
 * src/platform/access/rls-manager.ts
 *
 * Postgres RLS policy generation and application for Wave 8 access rules.
 * Wraps the lower-level rls-builder.ts with the TableAccessRule model.
 */

import type { PoolClient } from 'pg';
import type { TableAccessRule } from './types';
import { buildAccessFilter } from './rule-engine';

// AppRole mirrors platform RoleDef — only id and name needed here
export interface AppRole {
  id: string;
  name: string;
}

// ─── Identifier helpers ───────────────────────────────────────────────────────

function sanitizeIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe identifier: ${JSON.stringify(name)}`);
  }
  return name;
}

function quoteIdent(name: string): string {
  return `"${sanitizeIdent(name)}"`;
}

function tableName(tenantSlug: string, tableSlug: string): string {
  return `${quoteIdent(sanitizeIdent(tenantSlug))}.${quoteIdent(sanitizeIdent(tableSlug))}`;
}

function policyName(tenantSlug: string, tableSlug: string, roleId: string, operation: string): string {
  const safe = `${sanitizeIdent(tenantSlug)}_${sanitizeIdent(tableSlug)}_${roleId.replace(/[^a-zA-Z0-9_]/g, '_')}_${operation}`;
  return `"novo_${safe}"`;
}

// ─── SQL generation ───────────────────────────────────────────────────────────

/**
 * Generate CREATE POLICY SQL statements for a table, one policy per role per operation.
 *
 * The USING clause uses current_setting() session variables set by setRLSContext().
 * Rules for the same (role, operation) are OR-ed together.
 */
export function generateRLSPolicy(
  tenantSlug: string,
  tableSlug: string,
  rules: TableAccessRule[],
  roles: AppRole[],
): string[] {
  const statements: string[] = [];

  // First, enable RLS on the table
  statements.push(`ALTER TABLE ${tableName(tenantSlug, tableSlug)} ENABLE ROW LEVEL SECURITY;`);
  statements.push(`ALTER TABLE ${tableName(tenantSlug, tableSlug)} FORCE ROW LEVEL SECURITY;`);

  const operations = ['select', 'insert', 'update', 'delete'] as const;

  for (const role of roles) {
    for (const op of operations) {
      // Rules that apply to this role+operation combo
      const applicableRules = rules.filter(
        (r) =>
          (r.roleId === role.id || r.roleId === '__all__') &&
          (r.operation === op || r.operation === 'all'),
      );

      if (applicableRules.length === 0) continue;

      // Build a mock user context that uses current_setting() references
      // We use buildAccessFilter but the SQL output uses session variables, not literal values
      const mockUser = { id: role.id, role: role.id, locations: [] };
      const whereClause = buildAccessFilter(applicableRules, mockUser);

      const name = policyName(tenantSlug, tableSlug, role.id, op);
      const pgOp = op.toUpperCase();
      const table = tableName(tenantSlug, tableSlug);

      let dropSql = `DROP POLICY IF EXISTS ${name} ON ${table};`;
      let createSql: string;

      if (op === 'insert') {
        createSql = `CREATE POLICY ${name} ON ${table} FOR ${pgOp} WITH CHECK (${whereClause});`;
      } else if (op === 'update') {
        createSql = `CREATE POLICY ${name} ON ${table} FOR ${pgOp} USING (${whereClause}) WITH CHECK (${whereClause});`;
      } else {
        createSql = `CREATE POLICY ${name} ON ${table} FOR ${pgOp} USING (${whereClause});`;
      }

      statements.push(dropSql);
      statements.push(createSql);
    }
  }

  return statements;
}

/**
 * Apply RLS policies for a table by executing the generated DDL statements.
 * Runs inside a transaction so a partial failure rolls back cleanly.
 */
export async function applyRLSPolicies(
  tenantSlug: string,
  tableSlug: string,
  rules: TableAccessRule[],
  roles: AppRole[],
  client: PoolClient,
): Promise<void> {
  const statements = generateRLSPolicy(tenantSlug, tableSlug, rules, roles);

  await client.query('BEGIN');
  try {
    for (const sql of statements) {
      await client.query(sql);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/**
 * Set session variables for RLS at query time.
 * Must be called inside a transaction (SET LOCAL scope).
 *
 * Postgres RLS USING clauses read:
 *   current_setting('app.user_id', true)
 *   current_setting('app.user_role', true)
 *   current_setting('app.user_group', true)
 *   current_setting('app.locations', true)::jsonb
 */
export async function setRLSContext(
  client: PoolClient,
  userId: string,
  roleId: string,
  locations: string[],
  group?: string,
): Promise<void> {
  // Validate inputs — reject control characters that could break SET LOCAL
  const sanitize = (val: string, label: string): string => {
    if (typeof val !== 'string') throw new TypeError(`${label} must be a string`);
    if (/[\x00\n\r]/.test(val)) {
      throw new Error(`${label} contains illegal characters: ${JSON.stringify(val)}`);
    }
    return val.replace(/'/g, "''");
  };

  const safeUserId = sanitize(userId, 'userId');
  const safeRoleId = sanitize(roleId, 'roleId');
  const safeLocations = JSON.stringify(locations.map((l) => sanitize(l, 'location')));
  const safeGroup = group ? sanitize(group, 'group') : '';

  await client.query(`SET LOCAL "app.user_id" = '${safeUserId}'`);
  await client.query(`SET LOCAL "app.user_role" = '${safeRoleId}'`);
  await client.query(`SET LOCAL "app.locations" = '${safeLocations.replace(/'/g, "''")}'`);
  await client.query(`SET LOCAL "app.user_group" = '${safeGroup}'`);
}
