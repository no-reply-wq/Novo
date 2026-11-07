/**
 * src/platform/access/policy-applier.ts
 *
 * Applies RLS policies to a tenant's Postgres schema.
 *
 * When an app is published (or policies are saved), this:
 *  1. Loads all policies for the app via policy-store.
 *  2. For each table, drops all existing `novo_*` policies.
 *  3. Enables RLS on the table.
 *  4. Creates a `tenant_app_role` Postgres role if it doesn't exist.
 *  5. Issues CREATE POLICY DDL for each stored policy.
 */

import type { PoolClient } from 'pg';
import { loadAllPoliciesForApp } from './policy-store';

export interface ApplyResult {
  applied: number;
  errors: string[];
}

/**
 * Sanitize a Postgres identifier (schema name, table slug, etc.).
 * Only lowercase alphanumeric and underscores are permitted.
 */
function sanitizeIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${JSON.stringify(name)}`);
  }
  return name;
}

function quoteIdent(name: string): string {
  return `"${sanitizeIdent(name)}"`;
}

/**
 * Map StoredAccessPolicy.operation to the Postgres FOR clause keyword.
 */
const PG_OPERATION: Record<string, string> = {
  select: 'SELECT',
  insert: 'INSERT',
  update: 'UPDATE',
  delete: 'DELETE',
  all: 'ALL',
};

/**
 * Ensure the `tenant_app_role` Postgres role exists.
 * This is the role the runtime uses to execute queries under RLS.
 */
async function ensureTenantAppRole(client: PoolClient): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_app_role') THEN
        CREATE ROLE tenant_app_role NOLOGIN;
      END IF;
    END
    $$;
  `);
}

/**
 * Apply all RLS policies for an app to its tenant schema.
 *
 * @param client      - Postgres client (will manage its own transaction)
 * @param appId       - the app whose policies to apply
 * @param tenantSlug  - the tenant schema slug (e.g. 'acme' → schema 'tenant_acme')
 */
export async function applyPoliciesForApp(
  client: PoolClient,
  appId: string,
  tenantSlug: string,
): Promise<ApplyResult> {
  const errors: string[] = [];
  let applied = 0;

  // Load all policies for this app
  const policies = await loadAllPoliciesForApp(client, appId);

  // Group by table
  const byTable = new Map<string, typeof policies>();
  for (const policy of policies) {
    const existing = byTable.get(policy.tableApiKey) ?? [];
    existing.push(policy);
    byTable.set(policy.tableApiKey, existing);
  }

  await client.query('BEGIN');
  try {
    // Ensure the runtime role exists
    await ensureTenantAppRole(client);

    for (const [tableApiKey, tablePolicies] of byTable.entries()) {
      try {
        const schemaName = quoteIdent(`tenant_${tenantSlug}`);
        const tableName = quoteIdent(tableApiKey);
        const fullTableRef = `${schemaName}.${tableName}`;

        // Enable RLS on the table
        await client.query(`ALTER TABLE ${fullTableRef} ENABLE ROW LEVEL SECURITY`);

        // Drop all existing novo_* policies on this table
        const { rows: existingPolicies } = await client.query<{ policyname: string }>(
          `SELECT policyname FROM pg_policies
           WHERE schemaname = $1 AND tablename = $2 AND policyname LIKE 'novo_%'`,
          [`tenant_${tenantSlug}`, tableApiKey],
        );

        for (const { policyname } of existingPolicies) {
          // policyname comes from pg_policies — still sanitize for safety
          const safeName = policyname.replace(/[^a-zA-Z0-9_]/g, '_');
          await client.query(
            `DROP POLICY IF EXISTS "${safeName}" ON ${fullTableRef}`,
          );
        }

        // Create new policies
        for (const policy of tablePolicies) {
          const pgOp = PG_OPERATION[policy.operation] ?? 'ALL';
          const expr = policy.expr.trim() === '' ? 'false' : policy.expr;

          // Policy name: novo_<id> (id is already sanitized UUIDs from DB)
          const policyName = `"novo_${policy.id.replace(/[^a-zA-Z0-9_-]/g, '_')}"`;

          let clause: string;
          if (policy.operation === 'insert') {
            clause = `WITH CHECK (${expr})`;
          } else if (policy.operation === 'update' || policy.operation === 'all') {
            clause = `USING (${expr}) WITH CHECK (${expr})`;
          } else {
            clause = `USING (${expr})`;
          }

          await client.query(
            `CREATE POLICY ${policyName} ON ${fullTableRef} FOR ${pgOp} TO tenant_app_role ${clause}`,
          );
          applied++;
        }
      } catch (tableErr) {
        errors.push(
          `Table ${tableApiKey}: ${tableErr instanceof Error ? tableErr.message : String(tableErr)}`,
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  return { applied, errors };
}

/**
 * Apply RLS policies for a single table in a tenant schema.
 * Used when policies are saved mid-session (not full publish).
 */
export async function applyPoliciesForTable(
  client: PoolClient,
  appId: string,
  tenantSlug: string,
  tableApiKey: string,
): Promise<ApplyResult> {
  // Delegate to full app apply; it filters by table
  // For efficiency, we do only the target table here
  const { loadPolicies } = await import('./policy-store');
  const policies = await loadPolicies(client, appId, tableApiKey);

  const errors: string[] = [];
  let applied = 0;

  await client.query('BEGIN');
  try {
    await ensureTenantAppRole(client);

    const schemaName = quoteIdent(`tenant_${tenantSlug}`);
    const tableName = quoteIdent(tableApiKey);
    const fullTableRef = `${schemaName}.${tableName}`;

    await client.query(`ALTER TABLE ${fullTableRef} ENABLE ROW LEVEL SECURITY`);

    const { rows: existingPolicies } = await client.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
       WHERE schemaname = $1 AND tablename = $2 AND policyname LIKE 'novo_%'`,
      [`tenant_${tenantSlug}`, tableApiKey],
    );

    for (const { policyname } of existingPolicies) {
      const safeName = policyname.replace(/[^a-zA-Z0-9_]/g, '_');
      await client.query(`DROP POLICY IF EXISTS "${safeName}" ON ${fullTableRef}`);
    }

    for (const policy of policies) {
      try {
        const pgOp = PG_OPERATION[policy.operation] ?? 'ALL';
        const expr = policy.expr.trim() === '' ? 'false' : policy.expr;
        const policyName = `"novo_${policy.id.replace(/[^a-zA-Z0-9_-]/g, '_')}"`;

        let clause: string;
        if (policy.operation === 'insert') {
          clause = `WITH CHECK (${expr})`;
        } else if (policy.operation === 'update' || policy.operation === 'all') {
          clause = `USING (${expr}) WITH CHECK (${expr})`;
        } else {
          clause = `USING (${expr})`;
        }

        await client.query(
          `CREATE POLICY ${policyName} ON ${fullTableRef} FOR ${pgOp} TO tenant_app_role ${clause}`,
        );
        applied++;
      } catch (pErr) {
        errors.push(
          `Policy ${policy.id}: ${pErr instanceof Error ? pErr.message : String(pErr)}`,
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  return { applied, errors };
}
