/**
 * CRUD service for tenant data tables.
 *
 * All operations:
 *  - Run inside a tenant transaction with RLS context set
 *  - Validate required fields
 *  - Run validation expressions via the injected ExprEngine
 *  - Fire audit log entries
 *  - Respect soft-delete config
 *
 * Pagination uses cursor (after: UUID) + limit.
 */

import { Pool, PoolClient } from 'pg';
import type { TableDef, FieldDef } from '@/platform/contracts';
import type { ExprEngine, ExprContext } from '@/platform/expr';
import { logAudit, buildDiff } from './audit';
import { ValidationError, RecordNotFoundError, LockError } from './errors';
import { withTenantTx, RlsClaims } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordData = Record<string, unknown>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export interface QueryFilter {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'is_null';
  value?: unknown;
}

export interface QuerySort {
  field: string;
  dir: 'asc' | 'desc';
}

export interface Pagination {
  limit?: number;
  after?: string; // cursor: last seen id (UUID)
}

export interface CrudContext {
  userId: string;
  claims: RlsClaims;
  now?: Date;
}

// ─── Insert ───────────────────────────────────────────────────────────────────

export async function insertRecord(
  pool: Pool,
  tenantSlug: string,
  tableDef: TableDef,
  data: RecordData,
  ctx: CrudContext,
  exprEngine: ExprEngine,
): Promise<RecordData> {
  return withTenantTx(pool, tenantSlug, ctx.claims, async (client, schema) => {
    validateRequired(tableDef, data);
    await runValidationRules(tableDef, data, ctx, exprEngine);

    const cols = buildWriteColumns(tableDef, data);
    const colNames = [...cols.keys()];
    const values   = [...cols.values()];
    const placeholders = colNames.map((_, i) => `$${i + 2}`);

    const sql = `
      INSERT INTO ${pgIdent(schema)}.${pgIdent(tableDef.apiKey)}
        (${colNames.map(pgIdent).join(', ')},
         _created_by, _updated_by)
      VALUES
        (${placeholders.join(', ')},
         $1::uuid, $1::uuid)
      RETURNING *
    `;

    const res = await client.query<RecordData>(sql, [ctx.userId, ...values]);
    const inserted = res.rows[0];

    // Audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const [k, v] of Object.entries(inserted)) {
      diff[k] = { before: null, after: v };
    }
    await logAudit(client, `tenant_${tenantSlug}`, tableDef.apiKey, String(inserted['id']), ctx.userId, 'INSERT', diff);

    // Increment schema version tracking
    await bumpVersion(client, schema, tableDef.apiKey, String(inserted['id']));

    return inserted;
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateRecord(
  pool: Pool,
  tenantSlug: string,
  tableDef: TableDef,
  id: string,
  patch: RecordData,
  ctx: CrudContext,
  exprEngine: ExprEngine,
): Promise<RecordData> {
  return withTenantTx(pool, tenantSlug, ctx.claims, async (client, schema) => {
    // Load existing
    const existing = await fetchRow(client, schema, tableDef.apiKey, id);
    if (!existing) throw new RecordNotFoundError(tableDef.apiKey, id);

    // Lock check
    await checkLock(tableDef, existing, ctx, exprEngine);

    // Merge and validate
    const merged = { ...existing, ...patch };
    validateRequired(tableDef, merged);
    await runValidationRules(tableDef, merged, ctx, exprEngine);

    const cols = buildWriteColumns(tableDef, patch);
    if (cols.size === 0) return existing;

    const colNames = [...cols.keys()];
    const values   = [...cols.values()];
    const setClause = colNames.map((n, i) => `${pgIdent(n)} = $${i + 3}`).join(', ');

    const sql = `
      UPDATE ${pgIdent(schema)}.${pgIdent(tableDef.apiKey)}
         SET ${setClause},
             _updated_at  = now(),
             _updated_by  = $1::uuid,
             _version     = _version + 1
       WHERE id = $2::uuid
         AND deleted_at IS NULL
       RETURNING *
    `;

    const res = await client.query<RecordData>(sql, [ctx.userId, id, ...values]);
    if (!res.rows[0]) throw new RecordNotFoundError(tableDef.apiKey, id);

    const updated = res.rows[0];
    const diff = buildDiff(existing as Record<string, unknown>, updated as Record<string, unknown>);
    await logAudit(client, `tenant_${tenantSlug}`, tableDef.apiKey, id, ctx.userId, 'UPDATE', diff);

    return updated;
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRecord(
  pool: Pool,
  tenantSlug: string,
  tableDef: TableDef,
  id: string,
  ctx: CrudContext,
  exprEngine: ExprEngine,
  reason?: string,
): Promise<void> {
  await withTenantTx(pool, tenantSlug, ctx.claims, async (client, schema) => {
    const existing = await fetchRow(client, schema, tableDef.apiKey, id);
    if (!existing) throw new RecordNotFoundError(tableDef.apiKey, id);

    await checkLock(tableDef, existing, ctx, exprEngine);

    if (tableDef.softDelete?.enabled) {
      if (tableDef.softDelete.requireReason && !reason) {
        throw new ValidationError('delete_reason', 'A reason is required when deleting this record.');
      }
      await client.query(
        `UPDATE ${pgIdent(schema)}.${pgIdent(tableDef.apiKey)}
            SET deleted_at    = now(),
                deleted_by    = $1::uuid,
                delete_reason = $2
          WHERE id = $3::uuid`,
        [ctx.userId, reason ?? null, id],
      );
    } else {
      await client.query(
        `DELETE FROM ${pgIdent(schema)}.${pgIdent(tableDef.apiKey)} WHERE id = $1::uuid`,
        [id],
      );
    }

    const diff: Record<string, { before: unknown; after: unknown }> = {
      _deleted: { before: null, after: { at: new Date().toISOString(), reason: reason ?? null } },
    };
    await logAudit(client, `tenant_${tenantSlug}`, tableDef.apiKey, id, ctx.userId, 'DELETE', diff);
  });
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function queryRecords(
  pool: Pool,
  tenantSlug: string,
  tableDef: TableDef,
  filters: QueryFilter[],
  sorts: QuerySort[],
  pagination: Pagination,
  ctx: CrudContext,
): Promise<Page<RecordData>> {
  const claims = ctx.claims;
  const schema = `tenant_${tenantSlug}`;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO ${pgIdent(schema)}, public`);
    await client.query(`SELECT set_config('app.claims', $1, true)`, [
      JSON.stringify({ user_id: claims.userId, roles: claims.roles, locations: claims.locations }),
    ]);

    const limit = Math.min(pagination.limit ?? 50, 1000);
    const params: unknown[] = [];

    const whereClause = buildWhere(filters, params, pagination.after);

    // Sort
    const orderClause = sorts.length
      ? sorts.map(s => `${pgIdent(s.field)} ${s.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ')
      : 'id ASC';

    // Count
    const countRes = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count
         FROM ${pgIdent(schema)}.${pgIdent(tableDef.apiKey)}
        WHERE deleted_at IS NULL ${whereClause.sql}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count, 10);

    // Fetch page
    const dataRes = await client.query<RecordData>(
      `SELECT *
         FROM ${pgIdent(schema)}.${pgIdent(tableDef.apiKey)}
        WHERE deleted_at IS NULL ${whereClause.sql}
        ORDER BY ${orderClause}
        LIMIT $${params.length + 1}`,
      [...params, limit + 1], // fetch one extra to detect next page
    );

    await client.query('COMMIT');

    const rows = dataRes.rows;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(items[items.length - 1]['id']) : null;

    return { items, nextCursor, total };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Get one ─────────────────────────────────────────────────────────────────

export async function getRecord(
  pool: Pool,
  tenantSlug: string,
  tableDef: TableDef,
  id: string,
  ctx: CrudContext,
): Promise<RecordData | null> {
  const schema = `tenant_${tenantSlug}`;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO ${pgIdent(schema)}, public`);
    await client.query(`SELECT set_config('app.claims', $1, true)`, [
      JSON.stringify({ user_id: ctx.claims.userId, roles: ctx.claims.roles, locations: ctx.claims.locations }),
    ]);

    const row = await fetchRow(client, schema, tableDef.apiKey, id);
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchRow(
  client: PoolClient,
  schema: string,
  tableName: string,
  id: string,
): Promise<RecordData | null> {
  const res = await client.query<RecordData>(
    `SELECT * FROM ${pgIdent(schema)}.${pgIdent(tableName)}
      WHERE id = $1::uuid AND deleted_at IS NULL`,
    [id],
  );
  return res.rows[0] ?? null;
}

function validateRequired(tableDef: TableDef, data: RecordData): void {
  for (const field of tableDef.fields) {
    if (field.required === true) {
      const val = data[field.apiKey];
      if (val === null || val === undefined || val === '') {
        throw new ValidationError(field.apiKey, `${field.name} is required.`);
      }
    }
  }
}

async function runValidationRules(
  tableDef: TableDef,
  data: RecordData,
  ctx: CrudContext,
  exprEngine: ExprEngine,
): Promise<void> {
  const exprCtx: ExprContext = {
    record: data as Record<string, import('@/platform/expr').ExprValue>,
    user: {
      id: ctx.userId,
      email: '',
      roles: ctx.claims.roles,
      locations: ctx.claims.locations,
    },
    now: ctx.now,
  };

  for (const field of tableDef.fields) {
    if (!field.validationRules?.length) continue;
    for (const rule of field.validationRules) {
      try {
        const result = exprEngine.evaluateSource(rule.expression, exprCtx);
        if (result === false) {
          throw new ValidationError(field.apiKey, rule.message);
        }
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        // Expr evaluation failures are non-fatal (treat as pass)
      }
    }
  }
}

async function checkLock(
  tableDef: TableDef,
  record: RecordData,
  ctx: CrudContext,
  exprEngine: ExprEngine,
): Promise<void> {
  for (const field of tableDef.fields) {
    if (!field.lockWhen) continue;

    const exprCtx: ExprContext = {
      record: record as Record<string, import('@/platform/expr').ExprValue>,
      user: {
        id: ctx.userId,
        email: '',
        roles: ctx.claims.roles,
        locations: ctx.claims.locations,
      },
    };

    try {
      const locked = exprEngine.evaluateSource(field.lockWhen, exprCtx);
      if (locked === true) {
        // Check exception roles
        const exceptionRoles = field.lockExceptionRoles ?? [];
        const hasException = exceptionRoles.some(r => ctx.claims.roles.includes(r));
        if (!hasException) {
          throw new LockError(`Record is locked (field: ${field.name}).`);
        }
      }
    } catch (err) {
      if (err instanceof LockError) throw err;
      // Expr failures → not locked
    }
  }
}

function buildWriteColumns(
  tableDef: TableDef,
  data: RecordData,
): Map<string, unknown> {
  const writeable = new Set(
    tableDef.fields
      .filter(f => !['formula', 'rollup', 'lookup_value', 'status_from_rules'].includes(f.type))
      .map(f => f.apiKey),
  );

  const cols = new Map<string, unknown>();
  for (const [k, v] of Object.entries(data)) {
    if (writeable.has(k)) cols.set(k, v);
  }
  return cols;
}

interface WhereResult {
  sql: string;
}

function buildWhere(
  filters: QueryFilter[],
  params: unknown[],
  after?: string,
): WhereResult {
  const clauses: string[] = [];

  for (const f of filters) {
    const col = pgIdent(f.field);
    const p = `$${params.length + 1}`;

    switch (f.op) {
      case 'eq':
        clauses.push(`${col} = ${p}`);
        params.push(f.value);
        break;
      case 'neq':
        clauses.push(`${col} != ${p}`);
        params.push(f.value);
        break;
      case 'gt':
        clauses.push(`${col} > ${p}`);
        params.push(f.value);
        break;
      case 'gte':
        clauses.push(`${col} >= ${p}`);
        params.push(f.value);
        break;
      case 'lt':
        clauses.push(`${col} < ${p}`);
        params.push(f.value);
        break;
      case 'lte':
        clauses.push(`${col} <= ${p}`);
        params.push(f.value);
        break;
      case 'like':
        clauses.push(`${col} ILIKE ${p}`);
        params.push(f.value);
        break;
      case 'in':
        clauses.push(`${col} = ANY(${p})`);
        params.push(f.value);
        break;
      case 'is_null':
        clauses.push(`${col} IS NULL`);
        break;
    }
  }

  if (after) {
    clauses.push(`id > $${params.length + 1}::uuid`);
    params.push(after);
  }

  return {
    sql: clauses.length ? ' AND ' + clauses.join(' AND ') : '',
  };
}

async function bumpVersion(
  client: PoolClient,
  schema: string,
  tableName: string,
  id: string,
): Promise<void> {
  // _version is incremented on update; on insert it starts at 0, which is fine.
  // No-op here — INSERT already sets _version = 0 via column default.
  void client; void schema; void tableName; void id;
}

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}
