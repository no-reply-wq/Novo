/**
 * src/middleware/access.ts
 *
 * Runtime access middleware for the records API.
 *
 * Usage in route handlers:
 *   const guard = await AccessGuard.forRequest(req, tenantSlug, tableId, userId, roleId, locations);
 *   if (guard.blocked) return guard.blockedResponse();
 *   const safeRecord = guard.filterRecord(record);
 *   if (!guard.canWrite(payload)) return guard.writeBlockedResponse(payload);
 */

import { NextResponse } from 'next/server';
import type { FieldPermission, TableAccessRule, UserPermissionOverride } from '@/platform/access/types';
import { getFieldPermissions, applyFieldPermissions, getProtectedFieldViolations } from '@/platform/access/field-permissions';
import { evaluateAccessRule } from '@/platform/access/rule-engine';
import type { RuleUser } from '@/platform/access/types';

export type HttpOperation = 'select' | 'insert' | 'update' | 'delete';

export interface AccessGuardOptions {
  userId: string;
  roleId: string;
  locations: string[];
  group?: string;
  tableId: string;
  operation: HttpOperation;
  accessRules: TableAccessRule[];
  fieldPermissions: FieldPermission[];
  userOverride?: UserPermissionOverride;
}

export class AccessGuard {
  private readonly user: RuleUser;
  private readonly fieldPerms: Record<string, 'hidden' | 'read_only' | 'editable'>;
  private readonly applicableRules: TableAccessRule[];
  private readonly override?: UserPermissionOverride;
  private readonly operation: HttpOperation;

  constructor(opts: AccessGuardOptions) {
    this.user = {
      id: opts.userId,
      role: opts.roleId,
      locations: opts.locations,
      group: opts.group,
    };
    this.operation = opts.operation;
    this.override = opts.userOverride;

    this.fieldPerms = getFieldPermissions(
      opts.tableId,
      opts.fieldPermissions,
      opts.roleId,
      opts.userOverride,
    );

    // Filter to rules that apply to the operation
    this.applicableRules = opts.accessRules.filter(
      (r) =>
        (r.roleId === opts.roleId || r.roleId === '__all__') &&
        (r.operation === opts.operation || r.operation === 'all'),
    );
  }

  // ─── Operation-level checks ──────────────────────────────────────────────

  /** Check whether the user's override blocks a CRUD operation. */
  get blocked(): boolean {
    if (!this.override) return false;
    const { canCreate, canEdit, canDelete } = this.override.overrides;
    if (this.operation === 'insert' && canCreate === false) return true;
    if (this.operation === 'update' && canEdit === false) return true;
    if (this.operation === 'delete' && canDelete === false) return true;
    return false;
  }

  blockedResponse(): NextResponse {
    return NextResponse.json(
      { error: `Operation '${this.operation}' is not permitted for this user` },
      { status: 403 },
    );
  }

  // ─── Row-level filtering ──────────────────────────────────────────────────

  /**
   * Evaluate row-level access rules against a record.
   * Returns true if the user can see/touch the record.
   * When no access rules are defined, access defaults to true.
   */
  canAccessRecord(record: Record<string, unknown>): boolean {
    if (this.applicableRules.length === 0) return true;
    return this.applicableRules.some((rule) =>
      evaluateAccessRule(rule, record, this.user),
    );
  }

  // ─── Field-level filtering ───────────────────────────────────────────────

  /** Strip hidden fields from a record before returning it. */
  filterRecord(record: Record<string, unknown>): Record<string, unknown> {
    return applyFieldPermissions(record, this.fieldPerms);
  }

  /**
   * Check if a write payload touches any protected fields.
   * Returns 403 response if violations exist, null otherwise.
   */
  checkWritePayload(payload: Record<string, unknown>): NextResponse | null {
    const violations = getProtectedFieldViolations(payload, this.fieldPerms);
    if (violations.length === 0) return null;
    return NextResponse.json(
      {
        error: 'Write rejected: protected fields in payload',
        fields: violations,
      },
      { status: 403 },
    );
  }

  /** Filter rows in a list, applying both row-level and field-level rules. */
  filterRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows
      .filter((row) => this.canAccessRecord(row))
      .map((row) => this.filterRecord(row));
  }
}
