/**
 * src/platform/access/user-overrides.ts
 *
 * Per-user access overrides on top of role-based RLS policies.
 *
 * Schema (must be created by migration):
 *   CREATE TABLE IF NOT EXISTS platform.user_access_overrides (
 *     id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 *     app_id         TEXT NOT NULL,
 *     table_api_key  TEXT NOT NULL,
 *     user_id        TEXT NOT NULL,
 *     operation      TEXT NOT NULL,
 *     allowed        BOOLEAN NOT NULL,
 *     override_expr  TEXT,
 *     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *   CREATE UNIQUE INDEX IF NOT EXISTS idx_user_access_overrides_unique
 *     ON platform.user_access_overrides(app_id, table_api_key, user_id, operation);
 */

import type { PoolClient } from 'pg';

export interface UserAccessOverride {
  id: string;
  appId: string;
  tableApiKey: string;
  userId: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | 'all';
  /** true = explicitly allowed; false = explicitly denied */
  allowed: boolean;
  /** Optional additional expression to AND/OR with the base policy */
  overrideExpr?: string;
  createdAt: Date;
  updatedAt: Date;
}

type OverrideRow = {
  id: string;
  app_id: string;
  table_api_key: string;
  user_id: string;
  operation: string;
  allowed: boolean;
  override_expr: string | null;
  created_at: Date;
  updated_at: Date;
};

function rowToOverride(row: OverrideRow): UserAccessOverride {
  return {
    id: row.id,
    appId: row.app_id,
    tableApiKey: row.table_api_key,
    userId: row.user_id,
    operation: row.operation as UserAccessOverride['operation'],
    allowed: row.allowed,
    overrideExpr: row.override_expr ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Upsert a per-user override.
 */
export async function upsertOverride(
  client: PoolClient,
  override: Omit<UserAccessOverride, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<UserAccessOverride> {
  const { rows } = await client.query<OverrideRow>(
    `INSERT INTO platform.user_access_overrides
       (app_id, table_api_key, user_id, operation, allowed, override_expr)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (app_id, table_api_key, user_id, operation) DO UPDATE SET
       allowed       = EXCLUDED.allowed,
       override_expr = EXCLUDED.override_expr,
       updated_at    = NOW()
     RETURNING *`,
    [
      override.appId,
      override.tableApiKey,
      override.userId,
      override.operation,
      override.allowed,
      override.overrideExpr ?? null,
    ],
  );
  return rowToOverride(rows[0]);
}

/**
 * Load all overrides for a specific user+table combination.
 */
export async function loadOverridesForUser(
  client: PoolClient,
  appId: string,
  tableApiKey: string,
  userId: string,
): Promise<UserAccessOverride[]> {
  const { rows } = await client.query<OverrideRow>(
    `SELECT * FROM platform.user_access_overrides
     WHERE app_id = $1 AND table_api_key = $2 AND user_id = $3`,
    [appId, tableApiKey, userId],
  );
  return rows.map(rowToOverride);
}

/**
 * Delete a specific override.
 */
export async function deleteOverride(client: PoolClient, id: string): Promise<void> {
  await client.query(`DELETE FROM platform.user_access_overrides WHERE id = $1`, [id]);
}

/**
 * Determine the final access decision for a user+operation, applying any overrides
 * on top of the base RLS result.
 *
 * Logic:
 *  - If no override exists for this user+operation, return baseAllowed unchanged.
 *  - Exact operation match takes precedence over 'all'.
 *  - An explicit deny (allowed=false) always wins over a base allow.
 *  - An explicit allow (allowed=true) wins over a base deny.
 *  - When overrideExpr is set, it is advisory only (the caller must evaluate it);
 *    the returned boolean reflects the override's `allowed` flag.
 *
 * @param baseAllowed  - what the role-level RLS policy would allow
 * @param userId       - the requesting user
 * @param tableApiKey  - the table being accessed
 * @param operation    - the specific operation (select, insert, update, delete)
 * @param overrides    - loaded overrides for this user+table
 * @returns final access decision
 */
export function applyOverrides(
  baseAllowed: boolean,
  userId: string,
  tableApiKey: string,
  operation: 'select' | 'insert' | 'update' | 'delete',
  overrides: UserAccessOverride[],
): boolean {
  // Find exact operation match first, then 'all'
  const exactMatch = overrides.find(
    (o) => o.userId === userId && o.tableApiKey === tableApiKey && o.operation === operation,
  );
  const allMatch = overrides.find(
    (o) => o.userId === userId && o.tableApiKey === tableApiKey && o.operation === 'all',
  );

  const override = exactMatch ?? allMatch;
  if (!override) return baseAllowed;

  return override.allowed;
}
