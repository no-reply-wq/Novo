/**
 * Access control and row-level security contracts.
 *
 * RULE: Sub-agents may not change this file. Changes go through the Lead.
 */

// ─── AccessPolicy (row-level security) ───────────────────────────────────────

/**
 * A row-level policy is an expression evaluated at query time.
 * When it returns false the row is invisible (filtered out at Postgres RLS).
 *
 * Examples:
 *   "record.owner_id = user.id"
 *   "record.location_id in user.locations"
 *   "record.status in user.allowed_statuses"
 */
export interface AccessPolicy {
  id: string;
  tableId: string;
  roleId: string | '__all__';      // role this policy applies to; '__all__' = every role
  operation: 'select' | 'insert' | 'update' | 'delete' | 'all';
  condition: string;               // expression string; empty = deny all
  priority: number;                // lower wins when multiple policies match (default 100)
  enabled: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── FieldPermission (column-level) ──────────────────────────────────────────

export interface FieldPermission {
  id: string;
  fieldId: string;
  roleId: string;
  access: 'hidden' | 'read' | 'write';  // 'hidden' = not in SELECT; 'read' = no UPDATE
  conditionExpr?: string;                // optional: access level is conditional
  createdAt: Date;
  updatedAt: Date;
}

// ─── UserOverride (per-user exceptions on top of role) ───────────────────────

export interface UserOverride {
  id: string;
  userId: string;
  tableId: string;
  overrideType: 'grant' | 'revoke';
  operation: 'select' | 'insert' | 'update' | 'delete' | 'all';
  condition?: string;              // narrow the grant/revoke further
  expiresAt?: Date;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Location / org-unit ─────────────────────────────────────────────────────

/**
 * Locations are org-units (branches, warehouses, regions).
 * A user may belong to one or many locations.
 * Policies can reference `user.locations` (array of location ids).
 */
export interface LocationDef {
  id: string;
  appId: string;
  parentId?: string;        // supports a tree hierarchy
  code: string;             // e.g. "MUM", "DEL"
  name: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ─── RoleDef ─────────────────────────────────────────────────────────────────

export interface RoleDef {
  id: string;
  appId: string;
  name: string;             // e.g. "admin", "manager", "viewer"
  description?: string;
  isDefault?: boolean;      // assigned to new users by default
  createdAt: Date;
  updatedAt: Date;
}
