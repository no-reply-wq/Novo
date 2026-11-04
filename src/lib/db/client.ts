/**
 * Database Client
 * 
 * Two-layer database approach:
 * 1. Prisma client → global control-plane tables (tenants, platform_admins, etc.)
 * 2. pg (node-postgres) → per-tenant schema queries via raw SQL
 * 
 * The repository/adapter pattern means business logic never touches
 * a database driver directly — it goes through a TenantDb instance
 * whose methods are database-agnostic.
 */

import { PrismaClient } from '@prisma/client';
import { Pool, PoolClient } from 'pg';

// ─────────────────────────────────────────────────────────────
// Global Prisma client (control-plane)
// ─────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

// ─────────────────────────────────────────────────────────────
// Per-tenant Postgres pool (schema-per-tenant)
// ─────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pgPool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== 'production') {
  global.__pgPool = pgPool;
}

/**
 * Get a Postgres client scoped to a specific tenant schema.
 * All queries run with search_path set so unqualified table names
 * resolve to that tenant's schema.
 */
function assertSchemaName(name: string): void {
  if (!/^tenant_[a-z0-9_]{1,55}$/.test(name)) {
    throw new Error(`Invalid schema name: ${name}`);
  }
}

export async function getTenantClient(schemaName: string): Promise<PoolClient> {
  assertSchemaName(schemaName);
  const client = await pgPool.connect();
  // Set search_path so every query in this transaction targets the right schema
  await client.query(`SET search_path TO "${schemaName}", public`);
  return client;
}

/**
 * Run a callback inside a tenant schema context, automatically
 * releasing the client on completion or error.
 */
export async function withTenantDb<T>(
  schemaName: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getTenantClient(schemaName);
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

/**
 * Run a callback inside a transaction for a specific tenant.
 */
export async function withTenantTransaction<T>(
  schemaName: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getTenantClient(schemaName);
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────

export type QueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number;
};

export async function tenantQuery<T = Record<string, unknown>>(
  schemaName: string,
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return withTenantDb(schemaName, async (client) => {
    const result = await client.query(sql, params);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  });
}

/** Build a safe ORDER BY clause (whitelist-validated column names) */
export function buildOrderBy(
  column: string,
  direction: 'asc' | 'desc',
  allowedColumns: string[]
): string {
  if (!allowedColumns.includes(column)) {
    throw new Error(`Column "${column}" is not allowed for ordering`);
  }
  return `ORDER BY ${column} ${direction === 'asc' ? 'ASC' : 'DESC'}`;
}

/** Paginate a query: returns rows + total count */
export async function paginatedQuery<T = Record<string, unknown>>(
  schemaName: string,
  baseQuery: string,           // everything after WHERE
  countQuery: string,          // SELECT COUNT(*) ... (same WHERE)
  params: unknown[],
  page: number,
  pageSize: number
): Promise<{ rows: T[]; total: number; page: number; pageSize: number }> {
  const offset = (page - 1) * pageSize;
  const [dataResult, countResult] = await Promise.all([
    tenantQuery<T>(schemaName, `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
      ...params,
      pageSize,
      offset,
    ]),
    tenantQuery<{ count: string }>(schemaName, countQuery, params),
  ]);

  return {
    rows: dataResult.rows,
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
    page,
    pageSize,
  };
}
