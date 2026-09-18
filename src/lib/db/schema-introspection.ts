/**
 * Schema Introspection
 *
 * Replaces hardcoded table/column allowlists (which needed a developer
 * to edit code every time a tenant created a new custom table) with
 * live validation against the tenant's actual Postgres schema. A table
 * or column is "allowed" if and only if it genuinely exists in that
 * tenant's schema right now — this is both more dynamic (any real
 * table works immediately, no code change needed) and at least as safe
 * as a static whitelist (an attacker still can't reference a table/
 * column that doesn't exist, and these values are only ever used after
 * this check passes, in a parameterized query for the actual data).
 */

import { tenantQuery } from './client';

const SHORT_CACHE_MS = 30_000; // schemas don't change often; avoid re-querying information_schema on every keystroke
const cache = new Map<string, { value: unknown; expires: number }>();

function getCached<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit || hit.expires < Date.now()) return undefined;
  return hit.value as T;
}

function setCached(key: string, value: unknown) {
  cache.set(key, { value, expires: Date.now() + SHORT_CACHE_MS });
}

/** True if `tableName` genuinely exists as a table in this tenant's schema. */
export async function tableExistsInTenantSchema(schemaName: string, tableName: string): Promise<boolean> {
  const cacheKey = `table:${schemaName}:${tableName}`;
  const cached = getCached<boolean>(cacheKey);
  if (cached !== undefined) return cached;

  const result = await tenantQuery(
    schemaName,
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schemaName, tableName]
  );
  const exists = result.rows.length > 0;
  setCached(cacheKey, exists);
  return exists;
}

/** True if `columnName` genuinely exists on `tableName` in this tenant's schema. */
export async function columnExistsOnTable(schemaName: string, tableName: string, columnName: string): Promise<boolean> {
  const cacheKey = `col:${schemaName}:${tableName}:${columnName}`;
  const cached = getCached<boolean>(cacheKey);
  if (cached !== undefined) return cached;

  const result = await tenantQuery(
    schemaName,
    `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1`,
    [schemaName, tableName, columnName]
  );
  const exists = result.rows.length > 0;
  setCached(cacheKey, exists);
  return exists;
}

/** Every real, queryable table in this tenant's schema — for the UI Builder / Form Builder column pickers. */
export async function listTablesInTenantSchema(schemaName: string): Promise<string[]> {
  const cacheKey = `alltables:${schemaName}`;
  const cached = getCached<string[]>(cacheKey);
  if (cached !== undefined) return cached;

  const result = await tenantQuery<{ table_name: string }>(
    schemaName,
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [schemaName]
  );
  const tables = result.rows.map((r) => r.table_name);
  setCached(cacheKey, tables);
  return tables;
}

/** Every real column on a table in this tenant's schema, in column order — for the field-mapping pickers. */
export async function listColumnsOnTable(schemaName: string, tableName: string): Promise<string[]> {
  const cacheKey = `cols:${schemaName}:${tableName}`;
  const cached = getCached<string[]>(cacheKey);
  if (cached !== undefined) return cached;

  const result = await tenantQuery<{ column_name: string }>(
    schemaName,
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schemaName, tableName]
  );
  const columns = result.rows.map((r) => r.column_name);
  setCached(cacheKey, columns);
  return columns;
}

/** Call this after any DDL change (creating a table via Form Builder, etc.) so stale cache entries don't hide a brand new table. */
export function invalidateSchemaCache(schemaName: string) {
  for (const key of cache.keys()) {
    if (key.includes(`:${schemaName}:`) || key.endsWith(`:${schemaName}`)) cache.delete(key);
  }
}
