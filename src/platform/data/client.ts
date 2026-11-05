/**
 * Tenant-scoped database client.
 *
 * getTenantClient() returns a pg Pool scoped to `tenant_<slug>` schema.
 * setRlsContext() sets the claims JWT so RLS policies can read
 *   current_setting('claims')::jsonb
 */

import { Pool, PoolClient } from 'pg';

// ─── Pool registry ────────────────────────────────────────────────────────────

/**
 * Shared connection pool.  Callers must supply a pool (or the env-var-based
 * default) so that tests can inject a test pool without touching process.env.
 *
 * In production, the platform API creates one pool per process and passes it
 * through.  We do NOT create a singleton here to avoid import-time side effects.
 */

export function createPool(connectionString?: string): Pool {
  return new Pool({
    connectionString: connectionString ?? process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Returns the Postgres schema name for a tenant.
 */
export function tenantSchemaName(tenantSlug: string): string {
  // Sanitise: only allow [a-z0-9_]
  const safe = tenantSlug.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  return `tenant_${safe}`;
}

// ─── RLS context ─────────────────────────────────────────────────────────────

export interface RlsClaims {
  userId: string;
  roles: string[];
  locations: string[];
}

/**
 * Executes `SET LOCAL claims = '…'::jsonb` on an already-open client so that
 * RLS policies can read `current_setting('claims', true)::jsonb`.
 *
 * Must be called inside an active transaction (`BEGIN` already issued).
 */
export async function setRlsContext(
  client: PoolClient,
  claims: RlsClaims,
): Promise<void> {
  const json = JSON.stringify({
    user_id:   claims.userId,
    roles:     claims.roles,
    locations: claims.locations,
  });
  // Use parameter to avoid injection; cast in SQL
  // 'app.claims' is a custom GUC in the 'app' namespace — always valid in Postgres.
  await client.query(`SELECT set_config('app.claims', $1, true)`, [json]);
}

/**
 * Convenience: begin a transaction, set RLS context, run a callback, commit.
 * Rolls back automatically on error.
 */
export async function withTenantTx<T>(
  pool: Pool,
  tenantSlug: string,
  claims: RlsClaims,
  fn: (client: PoolClient, schema: string) => Promise<T>,
): Promise<T> {
  const schema = tenantSchemaName(tenantSlug);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Switch the search_path to the tenant schema for this transaction
    await client.query(`SET LOCAL search_path TO ${pgIdent(schema)}, public`);
    await setRlsContext(client, claims);
    const result = await fn(client, schema);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}
