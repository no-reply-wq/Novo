/**
 * Permission System
 * 
 * No implicit admin bypass — every access check goes through this.
 * Missing = deny. Explicit grant required for every module+action.
 */

import { tenantQuery } from '../db/client';

export type Action = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'manage_users' | 'manage_roles';

export interface UserPermissions {
  userId: string;
  roleId: string | null;
  grants: Map<string, Set<Action>>;  // "module" or "module:tab" → actions
}

/**
 * Load all permissions for a user (combines role-level + user-level grants).
 * User-level overrides role-level (for per-user exceptions).
 */
export async function loadUserPermissions(
  schemaName: string,
  userId: string
): Promise<UserPermissions> {
  const result = await tenantQuery<{
    role_id: string | null;
    module: string;
    tab: string | null;
    action: string;
    granted: boolean;
    source: string;
  }>(
    schemaName,
    `SELECT u.role_id,
            p.module, p.tab, p.action, p.granted,
            CASE WHEN p.user_id IS NOT NULL THEN 'user' ELSE 'role' END as source
     FROM users u
     LEFT JOIN permissions p ON (
       p.user_id = u.id
       OR (p.role_id = u.role_id AND p.user_id IS NULL)
     )
     WHERE u.id = $1 AND u.active = true
     ORDER BY source DESC`,
    [userId]
  );

  const grants = new Map<string, Set<Action>>();
  let roleId: string | null = null;

  for (const row of result.rows) {
    if (row.role_id) roleId = row.role_id;
    if (!row.module || !row.action) continue;

    const key = row.tab ? `${row.module}:${row.tab}` : row.module;
    if (!grants.has(key)) grants.set(key, new Set());

    if (row.granted) {
      grants.get(key)!.add(row.action as Action);
    } else {
      // Explicit deny overrides role grant
      grants.get(key)!.delete(row.action as Action);
    }
  }

  return { userId, roleId, grants };
}

/** Check if a user can perform an action on a module (optionally a specific tab). */
export function can(
  perms: UserPermissions,
  module: string,
  action: Action,
  tab?: string
): boolean {
  // Check module:tab first, then fall back to module-level
  if (tab) {
    const tabKey = `${module}:${tab}`;
    if (perms.grants.has(tabKey)) {
      return perms.grants.get(tabKey)!.has(action);
    }
  }
  return perms.grants.get(module)?.has(action) ?? false;
}

/** Throw a 403 if the permission check fails. */
export function assertCan(
  perms: UserPermissions,
  module: string,
  action: Action,
  tab?: string
): void {
  if (!can(perms, module, action, tab)) {
    throw new PermissionError(
      `Not allowed: ${action} on ${tab ? `${module}:${tab}` : module}`
    );
  }
}

export class PermissionError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

/**
 * Grant a set of permissions to a role.
 * Used at provisioning time and from the settings panel.
 */
export async function grantPermissions(
  schemaName: string,
  roleId: string,
  permissions: Array<{ module: string; tab?: string; action: Action }>
): Promise<void> {
  for (const p of permissions) {
    await tenantQuery(
      schemaName,
      `INSERT INTO permissions (role_id, module, tab, action, granted)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (role_id, module, COALESCE(tab, ''), action)
       DO UPDATE SET granted = true`,
      [roleId, p.module, p.tab ?? null, p.action]
    );
  }
}
