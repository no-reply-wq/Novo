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
 * Sets three GUCs so RLS policies can read individual fields without JSON parsing:
 *   current_setting('app.user_id', true)
 *   current_setting('app.roles', true)   -- JSON array string
 *   current_setting('app.locations', true) -- JSON array string
 *
 * Must be called inside an active transaction (`BEGIN` already issued).
 * Uses set_config with is_local=true so values are transaction-scoped.
 */
export async function setRlsContext(
  client: PoolClient,
  claims: RlsClaims,
): Promise<void> {
  const rolesJson = JSON.stringify(claims.roles);
  const locationsJson = JSON.stringify(claims.locations);
  await client.query(
    `SELECT
       set_config('app.user_id',    $1, true),
       set_config('app.roles',      $2, true),
       set_config('app.locations',  $3, true)`,
    [claims.userId, rolesJson, locationsJson],
  );
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
