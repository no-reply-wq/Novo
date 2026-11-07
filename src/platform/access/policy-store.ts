/**
 * src/platform/access/policy-store.ts
 *
 * Persistent storage for AccessPolicy records in platform.access_policies.
 * Table lives in the public (platform) schema so it is shared across tenants.
 *
 * Schema (must be created by migration):
 *   CREATE TABLE IF NOT EXISTS platform.access_policies (
 *     id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 *     app_id         TEXT NOT NULL,
 *     table_api_key  TEXT NOT NULL,
 *     role_id        TEXT NOT NULL,
 *     operation      TEXT NOT NULL,
 *     expr           TEXT NOT NULL DEFAULT '',
 *     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_access_policies_app_table
 *     ON platform.access_policies(app_id, table_api_key);
 */

import type { PoolClient } from 'pg';

export interface StoredAccessPolicy {
  id: string;
  appId: string;
  tableApiKey: string;
  roleId: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | 'all';
  expr: string;
  createdAt: Date;
  updatedAt: Date;
}

type PolicyRow = {
  id: string;
  app_id: string;
  table_api_key: string;
  role_id: string;
  operation: string;
  expr: string;
  created_at: Date;
  updated_at: Date;
};

function rowToPolicy(row: PolicyRow): StoredAccessPolicy {
  return {
    id: row.id,
    appId: row.app_id,
    tableApiKey: row.table_api_key,
    roleId: row.role_id,
    operation: row.operation as StoredAccessPolicy['operation'],
    expr: row.expr,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Upsert policies for a table, deleting any existing policies that are no longer present.
 *
 * @param client       - Postgres client (open connection, NOT inside a transaction)
 * @param appId        - owning app
 * @param tableApiKey  - table slug
 * @param policies     - full desired policy list; replaces any existing ones for this table
 */
export async function savePolicies(
  client: PoolClient,
  appId: string,
  tableApiKey: string,
  policies: Array<Omit<StoredAccessPolicy, 'id' | 'appId' | 'tableApiKey' | 'createdAt' | 'updatedAt'>>,
): Promise<StoredAccessPolicy[]> {
  await client.query('BEGIN');
  try {
    // Delete all existing policies for this (app, table) pair
    await client.query(
      `DELETE FROM platform.access_policies WHERE app_id = $1 AND table_api_key = $2`,
      [appId, tableApiKey],
    );

    if (policies.length === 0) {
      await client.query('COMMIT');
      return [];
    }

    // Bulk insert replacements
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const p of policies) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(appId, tableApiKey, p.roleId, p.operation, p.expr);
    }

    const { rows } = await client.query<PolicyRow>(
      `INSERT INTO platform.access_policies (app_id, table_api_key, role_id, operation, expr)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values,
    );

    await client.query('COMMIT');
    return rows.map(rowToPolicy);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/**
 * Load all policies for a specific (app, table) pair.
 */
export async function loadPolicies(
  client: PoolClient,
  appId: string,
  tableApiKey: string,
): Promise<StoredAccessPolicy[]> {
  const { rows } = await client.query<PolicyRow>(
    `SELECT * FROM platform.access_policies
     WHERE app_id = $1 AND table_api_key = $2
     ORDER BY created_at`,
    [appId, tableApiKey],
  );
  return rows.map(rowToPolicy);
}

/**
 * Load all policies for an entire app — used by the publish step.
 */
export async function loadAllPoliciesForApp(
  client: PoolClient,
  appId: string,
): Promise<StoredAccessPolicy[]> {
  const { rows } = await client.query<PolicyRow>(
    `SELECT * FROM platform.access_policies
     WHERE app_id = $1
     ORDER BY table_api_key, created_at`,
    [appId],
  );
  return rows.map(rowToPolicy);
}
