/**
 * field-filter.ts
 *
 * Strips hidden / enforces read-only fields from query results based on
 * FieldPermission definitions and the requesting user's roles.
 */

import type { FieldPermission } from '@/platform/contracts';

/**
 * Apply field-level permissions to a single row.
 *
 * Rules (applied in order):
 * 1. If ANY FieldPermission matching the field + any of userRoles says 'hidden',
 *    the field is removed from the output.
 * 2. Fields not referenced by any FieldPermission are returned as-is.
 *
 * Note: 'read' and 'write' distinctions are enforced at the mutation layer, not here.
 * This function is used at query time (SELECT results) to strip hidden fields.
 *
 * @param row              - the raw DB row
 * @param fieldPermissions - all FieldPermission objects relevant to this table
 * @param userRoles        - roles held by the requesting user
 * @returns a copy of the row with hidden fields removed
 */
export function applyFieldPermissions(
  row: Record<string, unknown>,
  fieldPermissions: FieldPermission[],
  userRoles: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...row };

  // Build a set of fields that are hidden for this user
  const hiddenFields = new Set<string>();

  for (const perm of fieldPermissions) {
    if (perm.access !== 'hidden') continue;
    // Check if this permission's role matches any of the user's roles
    if (userRoles.includes(perm.roleId) || perm.roleId === '__all__') {
      hiddenFields.add(perm.fieldId);
    }
  }

  for (const field of hiddenFields) {
    delete result[field];
  }

  return result;
}

/**
 * Apply field permissions to an array of rows.
 */
export function applyFieldPermissionsToRows(
  rows: Record<string, unknown>[],
  fieldPermissions: FieldPermission[],
  userRoles: string[],
): Record<string, unknown>[] {
  return rows.map((row) => applyFieldPermissions(row, fieldPermissions, userRoles));
}

/**
 * Returns the set of field ids that are hidden for the given roles.
 * Useful for query rewriting (omit columns from SELECT).
 */
export function getHiddenFields(
  fieldPermissions: FieldPermission[],
  userRoles: string[],
): Set<string> {
  const hidden = new Set<string>();
  for (const perm of fieldPermissions) {
    if (perm.access !== 'hidden') continue;
    if (userRoles.includes(perm.roleId) || perm.roleId === '__all__') {
      hidden.add(perm.fieldId);
    }
  }
  return hidden;
}

/**
 * Returns the set of field ids that are read-only for the given roles.
 * Used at mutation time to reject writes to protected fields.
 */
export function getReadOnlyFields(
  fieldPermissions: FieldPermission[],
  userRoles: string[],
): Set<string> {
  const readOnly = new Set<string>();
  for (const perm of fieldPermissions) {
    if (perm.access !== 'read') continue;
    if (userRoles.includes(perm.roleId) || perm.roleId === '__all__') {
      readOnly.add(perm.fieldId);
    }
  }
  return readOnly;
}
