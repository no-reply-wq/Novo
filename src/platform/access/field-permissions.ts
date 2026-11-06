/**
 * src/platform/access/field-permissions.ts
 *
 * Field-level permission evaluator.
 *
 * Resolves the effective permission for each field given role-based rules
 * and optional per-user overrides. Applies the result to filter records.
 */

import type { FieldPermission, UserPermissionOverride, FieldPermissionLevel } from './types';

// ─── Permission precedence ────────────────────────────────────────────────────
//
// Strictest wins across roles:
//   hidden > read_only > editable
//
// User override always overrides role default.

const PERMISSION_RANK: Record<FieldPermissionLevel, number> = {
  hidden: 0,
  read_only: 1,
  editable: 2,
};

function stricterOf(a: FieldPermissionLevel, b: FieldPermissionLevel): FieldPermissionLevel {
  return PERMISSION_RANK[a] <= PERMISSION_RANK[b] ? a : b;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the effective permission for each field for a user.
 *
 * Logic:
 * 1. Collect all FieldPermission rows for the table that match userRoleId.
 * 2. When multiple rows match the same field, take the strictest (hidden > read_only > editable).
 * 3. Fields not referenced by any FieldPermission default to 'editable'.
 * 4. Apply per-user overrides on top (override wins, strictness is NOT applied — the
 *    override is an explicit administrative choice that can loosen or tighten).
 *
 * @param tableId         - table to scope to (only permissions for this table are used)
 * @param fieldPermissions - all FieldPermission rows (pre-filtered or for the table)
 * @param userRoleId      - role of the requesting user
 * @param userOverride    - optional per-user override record
 * @returns map of fieldId → effective permission level
 */
export function getFieldPermissions(
  tableId: string,
  fieldPermissions: FieldPermission[],
  userRoleId: string,
  userOverride?: UserPermissionOverride,
): Record<string, FieldPermissionLevel> {
  // Start from role-based permissions for this table
  const tablePerms = fieldPermissions.filter((p) => p.tableId === tableId);

  const result: Record<string, FieldPermissionLevel> = {};

  for (const perm of tablePerms) {
    if (perm.roleId !== userRoleId && perm.roleId !== '__all__') continue;

    const current = result[perm.fieldId];
    if (current === undefined) {
      result[perm.fieldId] = perm.permission;
    } else {
      result[perm.fieldId] = stricterOf(current, perm.permission);
    }
  }

  // Apply per-user field overrides (administrative — explicit, not strictness-merged)
  if (userOverride && userOverride.tableId === tableId && userOverride.overrides.fieldOverrides) {
    for (const [fieldId, level] of Object.entries(userOverride.overrides.fieldOverrides)) {
      result[fieldId] = level;
    }
  }

  return result;
}

/**
 * Filter a record to remove hidden fields and return only visible ones.
 *
 * Fields with 'hidden' permission are deleted from the output.
 * Fields with 'read_only' or 'editable' are included as-is.
 *
 * @param record    - raw DB row
 * @param fieldPerms - map from getFieldPermissions()
 * @returns new object with hidden fields removed
 */
export function applyFieldPermissions(
  record: Record<string, unknown>,
  fieldPerms: Record<string, FieldPermissionLevel>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...record };
  for (const [fieldId, level] of Object.entries(fieldPerms)) {
    if (level === 'hidden') {
      delete result[fieldId];
    }
  }
  return result;
}

/**
 * Reject a mutation if any of the fields being written are read-only or hidden.
 *
 * @param payload   - incoming write payload (field → value)
 * @param fieldPerms - map from getFieldPermissions()
 * @returns array of field names that are protected (empty = write is allowed)
 */
export function getProtectedFieldViolations(
  payload: Record<string, unknown>,
  fieldPerms: Record<string, FieldPermissionLevel>,
): string[] {
  const violations: string[] = [];
  for (const field of Object.keys(payload)) {
    const level = fieldPerms[field];
    if (level === 'hidden' || level === 'read_only') {
      violations.push(field);
    }
  }
  return violations;
}
