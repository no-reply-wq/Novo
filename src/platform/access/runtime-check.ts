/**
 * src/platform/access/runtime-check.ts
 *
 * Runtime access enforcement: sets GUC variables on a Postgres connection so
 * that RLS policies can read user identity and roles via current_setting().
 *
 * Must be called inside an active transaction (uses SET LOCAL so the values
 * are automatically cleared when the transaction ends).
 *
 * Usage:
 *   await client.query('BEGIN');
 *   await enforceAccess(client, 'acme', userId, roles, locations);
 *   const { rows } = await client.query('SELECT * FROM "tenant_acme"."orders"');
 *   await client.query('COMMIT');
 */

import type { PoolClient } from 'pg';

/**
 * Inject RLS context GUC variables into the current transaction.
 *
 * The Postgres RLS policies read:
 *   current_setting('app.user_id',    true)             → TEXT
 *   current_setting('app.roles',      true)::jsonb      → TEXT[]
 *   current_setting('app.locations',  true)::jsonb      → TEXT[]
 *
 * @param client      - open PoolClient already inside BEGIN
 * @param tenantSlug  - tenant identifier (informational; not used in GUC but useful for logging)
 * @param userId      - authenticated user id
 * @param roles       - roles held by the user
 * @param locations   - location ids the user belongs to (including ancestors)
 */
export async function enforceAccess(
  client: PoolClient,
  tenantSlug: string,
  userId: string,
  roles: string[],
  locations: string[],
): Promise<void> {
  // Validate: reject values that could break SET LOCAL
  validateContextValue(userId, 'userId');
  for (const r of roles) validateContextValue(r, 'role');
  for (const l of locations) validateContextValue(l, 'location');
  // tenantSlug is informational only; still validate
  validateContextValue(tenantSlug, 'tenantSlug');

  const safeUserId = escapeSingleQuotes(userId);
  const rolesJson = escapeSingleQuotes(JSON.stringify(roles));
  const locationsJson = escapeSingleQuotes(JSON.stringify(locations));

  await client.query(`SET LOCAL "app.user_id"   = '${safeUserId}'`);
  await client.query(`SET LOCAL "app.roles"      = '${rolesJson}'`);
  await client.query(`SET LOCAL "app.locations"  = '${locationsJson}'`);
}

/** Rejects null bytes and newlines that could break SET LOCAL */
function validateContextValue(value: string, label: string): void {
  if (typeof value !== 'string') {
    throw new TypeError(`enforceAccess: ${label} must be a string, got ${typeof value}`);
  }
  if (/[\x00\n\r]/.test(value)) {
    throw new Error(
      `enforceAccess: ${label} contains illegal characters: ${JSON.stringify(value)}`,
    );
  }
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''");
}
