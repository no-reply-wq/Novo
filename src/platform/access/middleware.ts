/**
 * middleware.ts
 *
 * Next.js middleware helper: inject RLS context into every DB session so that
 * CREATE POLICY USING clauses can read current_setting('app.user_id') etc.
 *
 * Call injectRlsContext() at the start of every DB transaction / pooled connection
 * before running any tenant-data queries.
 */

import type { PgClient } from './location-manager';

/**
 * Inject RLS context variables into the current Postgres session using SET LOCAL.
 *
 * SET LOCAL makes the setting live for the current transaction only — it is
 * automatically reverted when the transaction ends, ensuring no context leaks
 * between requests that share a connection pool slot.
 *
 * The USING clauses in RLS policies read these via:
 *   current_setting('app.user_id', true)
 *   current_setting('app.roles', true)::jsonb
 *   current_setting('app.locations', true)::jsonb
 *
 * @param pgClient  - open Postgres client (must be inside an active transaction)
 * @param userId    - authenticated user id
 * @param roles     - roles held by the user
 * @param locations - all location ids the user belongs to (including ancestors)
 */
export async function injectRlsContext(
  pgClient: PgClient,
  userId: string,
  roles: string[],
  locations: string[],
): Promise<void> {
  // Validate inputs — never allow newlines or null bytes that could break SET LOCAL
  const safeUserId = sanitizeSettingValue(userId);
  const rolesJson = JSON.stringify(roles.map(sanitizeSettingValue));
  const locationsJson = JSON.stringify(locations.map(sanitizeSettingValue));

  // Execute SET LOCAL statements inside the caller's transaction
  await pgClient.query(`SET LOCAL "app.user_id" = '${escapeSingleQuotes(safeUserId)}'`);
  await pgClient.query(`SET LOCAL "app.roles" = '${escapeSingleQuotes(rolesJson)}'`);
  await pgClient.query(`SET LOCAL "app.locations" = '${escapeSingleQuotes(locationsJson)}'`);
}

/**
 * Sanitize a value for use in a Postgres session variable.
 * Rejects control characters that could break the SET LOCAL statement.
 */
function sanitizeSettingValue(value: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`RLS context value must be a string, got ${typeof value}`);
  }
  // Reject null bytes and newlines
  if (/[\x00\n\r]/.test(value)) {
    throw new Error(`RLS context value contains illegal characters: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Escape single quotes for embedding in a SQL literal string */
function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Clear RLS context in the current session.
 * Useful for administrative queries that should run without tenant restrictions.
 * Must still be called inside a transaction (SET LOCAL scope).
 */
export async function clearRlsContext(pgClient: PgClient): Promise<void> {
  await pgClient.query(`SET LOCAL "app.user_id" = ''`);
  await pgClient.query(`SET LOCAL "app.roles" = '[]'`);
  await pgClient.query(`SET LOCAL "app.locations" = '[]'`);
}

/**
 * Wraps a callback in a transaction with RLS context injected.
 * Automatically rolls back on error.
 *
 * Usage:
 *   await withRlsContext(db, userId, roles, locations, async (client) => {
 *     return client.query('SELECT * FROM orders');
 *   });
 */
export async function withRlsContext<T>(
  pgClient: PgClient,
  userId: string,
  roles: string[],
  locations: string[],
  callback: (client: PgClient) => Promise<T>,
): Promise<T> {
  await pgClient.query('BEGIN');
  try {
    await injectRlsContext(pgClient, userId, roles, locations);
    const result = await callback(pgClient);
    await pgClient.query('COMMIT');
    return result;
  } catch (err) {
    await pgClient.query('ROLLBACK');
    throw err;
  }
}
