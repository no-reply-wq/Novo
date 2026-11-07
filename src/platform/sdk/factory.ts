/**
 * SDK factory — creates a fully-wired NovoSDK instance for a tenant script run.
 *
 * Wraps the existing `buildSdk` from scripts/sdk.ts and adds the extra methods
 * (findById, findMany, delete, email, whatsapp, env) required by the new interface.
 */

import { Pool, PoolClient } from 'pg';
import { buildSdk } from '../scripts/sdk.js';
import type { NovoSDK, ScriptContext } from './types.js';

export interface SdkFactoryOptions {
  /** Outbound HTTP allowlist — requests outside this list are blocked. */
  allowedUrls?: string[];
  /** Resolved tenant secrets (key → value). */
  secrets?: Record<string, string>;
}

/**
 * Create a NovoSDK instance scoped to `context.tenantSlug`.
 * Returns the SDK and the logs array that the script will append to.
 */
export function createSdk(
  context: ScriptContext,
  pgPool: Pool,
  options: SdkFactoryOptions = {}
): { sdk: NovoSDK; logs: string[] } {
  const logs: string[] = [];
  const secrets = options.secrets ?? {};
  const allowedUrls = options.allowedUrls;

  // Shared helper: acquire a tenant-scoped client
  async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pgPool.connect();
    try {
      await client.query(`SET search_path TO "tenant_${context.tenantSlug}", public`);
      return await fn(client);
    } finally {
      client.release();
    }
  }

  // URL allowlist guard
  function checkUrl(url: string): void {
    if (!allowedUrls || allowedUrls.length === 0) return;
    const { hostname } = new URL(url);
    if (!allowedUrls.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))) {
      throw new Error(`HTTP request to ${hostname} is not in the allowed URL list`);
    }
  }

  // Build the core ScriptSdk from the existing factory (handles SSRF guard etc.)
  const returnBox: { value: unknown; set: boolean } = { value: undefined, set: false };
  const coreSdk = buildSdk(
    {
      pool: pgPool,
      tenantSlug: context.tenantSlug,
      secretsStore: secrets,
    },
    logs,
    returnBox
  );

  const sdk: NovoSDK = {
    db: {
      query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> => {
        return withClient(async (client) => {
          const result = await client.query(sql, params);
          return result.rows as T[];
        });
      },

      insert: async (table, record) => {
        const cols = Object.keys(record);
        const vals = Object.values(record);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
        return withClient(async (client) => {
          const result = await client.query(sql, vals);
          return result.rows[0] as Record<string, unknown>;
        });
      },

      update: async (table, id, patch) => {
        const keys = Object.keys(patch);
        const vals = Object.values(patch);
        const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
        const sql = `UPDATE "${table}" SET ${setClauses} WHERE id = $1`;
        await withClient((client) => client.query(sql, [id, ...vals]));
      },

      delete: async (table, id) => {
        await withClient((client) =>
          client.query(`DELETE FROM "${table}" WHERE id = $1`, [id])
        );
      },

      findById: async (table, id) => {
        return withClient(async (client) => {
          const result = await client.query(`SELECT * FROM "${table}" WHERE id = $1 LIMIT 1`, [id]);
          return (result.rows[0] as Record<string, unknown>) ?? null;
        });
      },

      findMany: async (table, filter, opts) => {
        return withClient(async (client) => {
          const params: unknown[] = [];
          let where = '';
          if (filter && Object.keys(filter).length > 0) {
            const clauses = Object.entries(filter).map(([k, v]) => {
              params.push(v);
              return `"${k}" = $${params.length}`;
            });
            where = `WHERE ${clauses.join(' AND ')}`;
          }
          const orderBy = opts?.orderBy ? `ORDER BY ${opts.orderBy}` : '';
          const limit = opts?.limit != null ? `LIMIT ${opts.limit}` : '';
          const offset = opts?.offset != null ? `OFFSET ${opts.offset}` : '';
          const sql = `SELECT * FROM "${table}" ${where} ${orderBy} ${limit} ${offset}`.trim();
          const result = await client.query(sql, params);
          return result.rows as Record<string, unknown>[];
        });
      },
    },

    http: {
      get: async (url, opts) => {
        checkUrl(url);
        const res = await coreSdk.http.get(url, opts?.headers);
        return { status: res.status, body: res.body };
      },
      post: async (url, body, opts) => {
        checkUrl(url);
        const res = await coreSdk.http.post(url, body, opts?.headers);
        return { status: res.status, body: res.body };
      },
    },

    email: {
      send: async (to, subject, html) => {
        logs.push(`[email] To:${to} Subject:${subject} (${html.length} chars)`);
        // Real implementation would call an email provider here
      },
    },

    whatsapp: {
      send: async (to, message) => {
        logs.push(`[whatsapp] To:${to}: ${message}`);
        // Real implementation would call the WhatsApp API here
      },
    },

    log: (message, data) => {
      const entry = data !== undefined ? `${message} ${JSON.stringify(data)}` : message;
      logs.push(entry);
    },

    env: (key) => secrets[key],
  };

  return { sdk, logs };
}
