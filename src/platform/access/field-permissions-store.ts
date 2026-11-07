/**
 * src/platform/access/field-permissions-store.ts
 *
 * Persistent storage and runtime filter for field-level permissions.
 *
 * Schema (must be created by migration):
 *   CREATE TABLE IF NOT EXISTS platform.field_permissions (
 *     id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 *     app_id         TEXT NOT NULL,
 *     table_api_key  TEXT NOT NULL,
 *     field_api_key  TEXT NOT NULL,
 *     role_id        TEXT NOT NULL,
 *     permission     TEXT NOT NULL,  -- 'read_write' | 'read_only' | 'hidden'
 *     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     UNIQUE (app_id, table_api_key, field_api_key, role_id)
 *   );
 */

import type { PoolClient } from 'pg';

export type FieldPermissionLevel = 'read_write' | 'read_only' | 'hidden';

/** One field-role permission row */
export interface FieldPermissionRecord {
  id: string;
  appId: string;
  tableApiKey: string;
  fieldApiKey: string;
  roleId: string;
  permission: FieldPermissionLevel;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload accepted when saving field permissions */
export type FieldPermissions = Array<{
  fieldApiKey: string;
  roleId: string;
  permission: FieldPermissionLevel;
}>;

type FpRow = {
  id: string;
  app_id: string;
  table_api_key: string;
  field_api_key: string;
  role_id: string;
  permission: string;
  created_at: Date;
  updated_at: Date;
};

function rowToRecord(row: FpRow): FieldPermissionRecord {
  return {
    id: row.id,
    appId: row.app_id,
    tableApiKey: row.table_api_key,
    fieldApiKey: row.field_api_key,
    roleId: row.role_id,
    permission: row.permission as FieldPermissionLevel,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Upsert field permissions for a table, replacing any existing ones.
 */
export async function saveFieldPermissions(
  client: PoolClient,
  appId: string,
  tableApiKey: string,
  fp: FieldPermissions,
): Promise<FieldPermissionRecord[]> {
  await client.query('BEGIN');
  try {
    // Delete all existing field permissions for this (app, table)
    await client.query(
      `DELETE FROM platform.field_permissions WHERE app_id = $1 AND table_api_key = $2`,
      [appId, tableApiKey],
    );

    if (fp.length === 0) {
      await client.query('COMMIT');
      return [];
    }

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const item of fp) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(appId, tableApiKey, item.fieldApiKey, item.roleId, item.permission);
    }

    const { rows } = await client.query<FpRow>(
      `INSERT INTO platform.field_permissions
         (app_id, table_api_key, field_api_key, role_id, permission)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values,
    );

    await client.query('COMMIT');
    return rows.map(rowToRecord);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/**
 * Load field permissions for a table, returned as a nested map:
 *   { [fieldApiKey]: { [roleId]: FieldPermissionLevel } }
 */
export async function loadFieldPermissions(
  client: PoolClient,
  appId: string,
  tableApiKey: string,
): Promise<Record<string, Record<string, FieldPermissionLevel>>> {
  const { rows } = await client.query<FpRow>(
    `SELECT * FROM platform.field_permissions
     WHERE app_id = $1 AND table_api_key = $2`,
    [appId, tableApiKey],
  );

  const result: Record<string, Record<string, FieldPermissionLevel>> = {};
  for (const row of rows) {
    if (!result[row.field_api_key]) result[row.field_api_key] = {};
    result[row.field_api_key][row.role_id] = row.permission as FieldPermissionLevel;
  }
  return result;
}

/**
 * Filter a record's fields based on the user's roles and field permissions.
 *
 * - 'hidden' fields are removed from the output.
 * - 'read_only' fields are included but should be blocked on write (by the caller).
 * - 'read_write' and unspecified fields are included as-is.
 *
 * @param record          - raw DB row
 * @param fieldTypes      - map of fieldApiKey → type string (used for future validation)
 * @param userRoles       - roles the user holds
 * @param fieldPermissions - nested map from loadFieldPermissions()
 */
export function filterRecordFields(
  record: Record<string, unknown>,
  fieldTypes: Record<string, string>,
  userRoles: string[],
  fieldPermissions: Record<string, Record<string, FieldPermissionLevel>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(record)) {
    // Skip fields not in fieldTypes (unexpected columns)
    if (!(field in fieldTypes) && Object.keys(fieldTypes).length > 0) {
      continue;
    }

    // Determine effective permission for this field given user's roles
    const effectivePermission = resolveFieldPermission(field, userRoles, fieldPermissions);

    if (effectivePermission !== 'hidden') {
      result[field] = value;
    }
  }

  return result;
}

/**
 * Resolve the effective permission for a field given multiple roles.
 * Most restrictive permission wins: hidden > read_only > read_write.
 */
function resolveFieldPermission(
  fieldApiKey: string,
  userRoles: string[],
  fieldPermissions: Record<string, Record<string, FieldPermissionLevel>>,
): FieldPermissionLevel {
  const fieldRoleMap = fieldPermissions[fieldApiKey];
  if (!fieldRoleMap) return 'read_write'; // default: full access

  const RANK: Record<FieldPermissionLevel, number> = {
    hidden: 0,
    read_only: 1,
    read_write: 2,
  };

  let effective: FieldPermissionLevel = 'read_write';
  for (const role of userRoles) {
    const perm = fieldRoleMap[role] ?? fieldRoleMap['__all__'];
    if (perm && RANK[perm] < RANK[effective]) {
      effective = perm;
    }
  }
  return effective;
}
