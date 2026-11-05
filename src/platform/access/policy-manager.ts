/**
 * policy-manager.ts
 *
 * CRUD operations for AccessPolicy and FieldPermission in the platform DB.
 * Also handles publishing policies as Postgres RLS rules via rls-builder.ts.
 */

import type { AccessPolicy, FieldPermission } from '@/platform/contracts';
import type { ExprEngine, ExprType } from '@/platform/expr';
import type { PgClient } from './location-manager';
import { buildRlsPolicies } from './rls-builder';

export class PolicyManager {
  constructor(
    private readonly db: PgClient,
    private readonly engine: ExprEngine,
  ) {}

  // ─── AccessPolicy CRUD ──────────────────────────────────────────────────────

  async upsertPolicy(policy: Omit<AccessPolicy, 'createdAt' | 'updatedAt'>): Promise<AccessPolicy> {
    const { rows } = await this.db.query<{
      id: string;
      table_id: string;
      role_id: string;
      operation: string;
      condition: string;
      priority: number;
      enabled: boolean;
      description: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO public.access_policies
         (id, table_id, role_id, operation, condition, priority, enabled, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         table_id    = EXCLUDED.table_id,
         role_id     = EXCLUDED.role_id,
         operation   = EXCLUDED.operation,
         condition   = EXCLUDED.condition,
         priority    = EXCLUDED.priority,
         enabled     = EXCLUDED.enabled,
         description = EXCLUDED.description,
         updated_at  = NOW()
       RETURNING *`,
      [
        policy.id,
        policy.tableId,
        policy.roleId,
        policy.operation,
        policy.condition,
        policy.priority,
        policy.enabled,
        policy.description ?? null,
      ],
    );
    return rowToAccessPolicy(rows[0]);
  }

  async getPolicy(id: string): Promise<AccessPolicy | null> {
    const { rows } = await this.db.query<{
      id: string;
      table_id: string;
      role_id: string;
      operation: string;
      condition: string;
      priority: number;
      enabled: boolean;
      description: string | null;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM public.access_policies WHERE id = $1`, [id]);
    if (rows.length === 0) return null;
    return rowToAccessPolicy(rows[0]);
  }

  async listPoliciesForTable(tableId: string): Promise<AccessPolicy[]> {
    const { rows } = await this.db.query<{
      id: string;
      table_id: string;
      role_id: string;
      operation: string;
      condition: string;
      priority: number;
      enabled: boolean;
      description: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM public.access_policies WHERE table_id = $1 ORDER BY priority, created_at`,
      [tableId],
    );
    return rows.map(rowToAccessPolicy);
  }

  async deletePolicy(id: string): Promise<void> {
    await this.db.query(`DELETE FROM public.access_policies WHERE id = $1`, [id]);
  }

  // ─── FieldPermission CRUD ───────────────────────────────────────────────────

  async upsertFieldPermission(
    perm: Omit<FieldPermission, 'createdAt' | 'updatedAt'>,
  ): Promise<FieldPermission> {
    const { rows } = await this.db.query<{
      id: string;
      field_id: string;
      role_id: string;
      access: 'hidden' | 'read' | 'write';
      condition_expr: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO public.field_permissions (id, field_id, role_id, access, condition_expr)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         field_id       = EXCLUDED.field_id,
         role_id        = EXCLUDED.role_id,
         access         = EXCLUDED.access,
         condition_expr = EXCLUDED.condition_expr,
         updated_at     = NOW()
       RETURNING *`,
      [perm.id, perm.fieldId, perm.roleId, perm.access, perm.conditionExpr ?? null],
    );
    return rowToFieldPermission(rows[0]);
  }

  async listFieldPermissionsForRole(roleId: string): Promise<FieldPermission[]> {
    const { rows } = await this.db.query<{
      id: string;
      field_id: string;
      role_id: string;
      access: 'hidden' | 'read' | 'write';
      condition_expr: string | null;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM public.field_permissions WHERE role_id = $1 ORDER BY field_id`, [roleId]);
    return rows.map(rowToFieldPermission);
  }

  async deleteFieldPermission(id: string): Promise<void> {
    await this.db.query(`DELETE FROM public.field_permissions WHERE id = $1`, [id]);
  }

  // ─── RLS publish ────────────────────────────────────────────────────────────

  /**
   * Compile all enabled policies for a table and install them as Postgres RLS policies.
   * Runs inside a transaction.
   *
   * @param tableId    - the table whose policies to publish
   * @param fieldTypes - schema for the table, used by the expr engine
   */
  async publishRlsPolicies(
    tableId: string,
    fieldTypes: Record<string, ExprType>,
  ): Promise<void> {
    const all = await this.listPoliciesForTable(tableId);
    const enabled = all.filter((p) => p.enabled);
    const { transactionSql } = buildRlsPolicies(enabled, fieldTypes, this.engine);
    // Execute the full transaction block as a single query
    await this.db.query(transactionSql);
  }
}

function rowToAccessPolicy(row: {
  id: string;
  table_id: string;
  role_id: string;
  operation: string;
  condition: string;
  priority: number;
  enabled: boolean;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}): AccessPolicy {
  return {
    id: row.id,
    tableId: row.table_id,
    roleId: row.role_id,
    operation: row.operation as AccessPolicy['operation'],
    condition: row.condition,
    priority: row.priority,
    enabled: row.enabled,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFieldPermission(row: {
  id: string;
  field_id: string;
  role_id: string;
  access: 'hidden' | 'read' | 'write';
  condition_expr: string | null;
  created_at: Date;
  updated_at: Date;
}): FieldPermission {
  return {
    id: row.id,
    fieldId: row.field_id,
    roleId: row.role_id,
    access: row.access,
    conditionExpr: row.condition_expr ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
