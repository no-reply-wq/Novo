/**
 * src/platform/access/types.ts
 *
 * Access control types for Wave 8 — row-level rules, field permissions,
 * and per-user overrides. These extend the platform contracts with
 * the richer expression-based model used by the rule engine.
 */

// ─── Row-level access rules ──────────────────────────────────────────────────

/**
 * A table access rule grants or restricts row visibility for a role.
 *
 * The condition is a human-readable expression string evaluated by the rule engine.
 * Examples:
 *   'record.owner_id == user.id'
 *   'record.location_id in user.locations'
 *   'record.client.sales_group == user.group'
 *   'record.status in ["Draft","Pending"]'
 *   'user.role == "admin"'   ← no row filter = access all
 */
export interface TableAccessRule {
  id: string;
  tableId: string;
  roleId: string;           // role this rule applies to
  operation: 'select' | 'insert' | 'update' | 'delete' | 'all';
  condition: string;        // expression referencing 'record.*' and 'user.*'
  priority: number;         // lower value = higher priority; default 0
  createdAt?: Date;
}

// ─── Field-level permissions ─────────────────────────────────────────────────

export interface FieldPermission {
  id: string;
  tableId: string;
  fieldId: string;
  roleId: string;
  permission: 'hidden' | 'read_only' | 'editable';
}

// ─── Per-user permission overrides ───────────────────────────────────────────

export interface UserPermissionOverride {
  id: string;
  userId: string;
  tableId: string;
  overrides: {
    canCreate?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    fieldOverrides?: Record<string, 'hidden' | 'read_only' | 'editable'>;
    rowFilter?: string;    // additional expression AND-ed with role rules
  };
}

// ─── Evaluation context ───────────────────────────────────────────────────────

/** The user context available to rule expressions. */
export interface RuleUser {
  id: string;
  role: string;
  locations: string[];
  group?: string;
}

/** Allowed permission values */
export type FieldPermissionLevel = 'hidden' | 'read_only' | 'editable';
