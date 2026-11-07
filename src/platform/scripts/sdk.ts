/**
 * ScriptSdk — the API surface exposed to tenant scripts.
 *
 * All database calls are tenant-scoped (search_path locked to tenant schema).
 * HTTP calls are SSRF-guarded (private IPs and metadata endpoints are blocked).
 * Secrets are read-only and never expose raw key material beyond the value.
 */

import * as dns from 'dns/promises';
import { Pool } from 'pg';
import { SsrfBlockedError } from './errors';
import { tenantSchemaName } from '../data/client';

// ─── SSRF guard ───────────────────────────────────────────────────────────────

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,                       // loopback
  /^10\./,                        // RFC 1918
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC 1918
  /^192\.168\./,                  // RFC 1918
  /^169\.254\./,                  // link-local / AWS metadata
  /^::1$/,                        // IPv6 loopback
  /^fc00:/i,                      // IPv6 unique local
  /^fd[0-9a-f]{2}:/i,             // IPv6 unique local
  /^fe80:/i,                      // IPv6 link-local
];

const BLOCKED_HOSTS: Set<string> = new Set(['localhost', 'metadata.google.internal']);

async function assertSsrfSafe(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(rawUrl);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(hostname)) {
    throw new SsrfBlockedError(rawUrl);
  }

  // Resolve hostname to IPs and check each
  let addresses: string[];
  try {
    const resolved = await dns.resolve(hostname);
    addresses = resolved;
  } catch {
    // If resolution fails, also try lookup which covers numeric IPs
    try {
      const lookup = await dns.lookup(hostname, { all: true });
      addresses = lookup.map((e) => e.address);
    } catch {
      // Can't resolve — treat as blocked to be safe
      throw new SsrfBlockedError(rawUrl);
    }
  }

  for (const ip of addresses) {
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(ip)) {
        throw new SsrfBlockedError(rawUrl);
      }
    }
    // Check for raw private IP as hostname too
    if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) {
      throw new SsrfBlockedError(rawUrl);
    }
  }
}

// ─── INR formatting ───────────────────────────────────────────────────────────

export function formatINR(amount: number): string {
  // Indian number system: last 3 digits, then groups of 2
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
  const sign = amount < 0 ? '-' : '';

  let formatted: string;
  if (intPart.length <= 3) {
    formatted = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const groups = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formatted = `${groups},${last3}`;
  }

  return `${sign}₹${formatted}.${decPart}`;
}

// ─── Amount in words (Indian system) ─────────────────────────────────────────

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + belowThousand(n % 100) : '');
}

export function amountInWords(amount: number): string {
  const n = Math.floor(Math.abs(amount));
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;

  const parts: string[] = [];
  if (crore) parts.push(belowThousand(crore) + ' Crore');
  if (lakh) parts.push(belowThousand(lakh) + ' Lakh');
  if (thousand) parts.push(belowThousand(thousand) + ' Thousand');
  if (rest) parts.push(belowThousand(rest));

  return parts.join(' ');
}

// ─── ScriptSdk interface ──────────────────────────────────────────────────────

export interface ScriptSdk {
  db: {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    insert(tableApiKey: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
    update(tableApiKey: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  };

  http: {
    get(url: string, headers?: Record<string, string>): Promise<{ status: number; body: unknown }>;
    post(url: string, body: unknown, headers?: Record<string, string>): Promise<{ status: number; body: unknown }>;
  };

  secrets: {
    get(name: string): Promise<string>;
  };

  log: {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  };

  formatINR(amount: number): string;
  amountInWords(amount: number): string;
  return(value: unknown): void;
}

// ─── Build a real SDK instance ────────────────────────────────────────────────

export interface SdkDeps {
  pool: Pool;
  tenantSlug: string;
  secretsStore?: Record<string, string>; // for tests; prod would call a secrets manager
}

export function buildSdk(deps: SdkDeps, logs: string[], returnBox: { value: unknown; set: boolean }): ScriptSdk {
  const schema = tenantSchemaName(deps.tenantSlug);

  // Reject SQL that explicitly references other tenant schemas or public
  function assertNoSchemaEscape(sql: string): void {
    const safeSlug = deps.tenantSlug.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const pattern = new RegExp(
      `\\bpublic\\s*\\.\\s*\\w+|\\btenant_(?!${safeSlug})\\w+\\s*\\.\\s*\\w+`,
      'i',
    );
    if (pattern.test(sql)) {
      throw new Error(`Cross-tenant schema access denied in SQL: ${sql}`);
    }
  }

  return {
    db: {
      async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
        assertNoSchemaEscape(sql);
        const client = await deps.pool.connect();
        try {
          await client.query(`SET search_path TO ${schema}, public`);
          const result = await client.query(sql, params ?? []);
          return result.rows as T[];
        } finally {
          client.release();
        }
      },

      async insert(tableApiKey: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
        const cols = Object.keys(data);
        if (cols.length === 0) throw new Error('insert: data must have at least one column');
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const colList = cols.map((c) => `"${c}"`).join(', ');
        const sql = `INSERT INTO "${tableApiKey}" (${colList}) VALUES (${placeholders}) RETURNING *`;
        const client = await deps.pool.connect();
        try {
          await client.query(`SET search_path TO ${schema}, public`);
          const result = await client.query(sql, Object.values(data));
          return result.rows[0] as Record<string, unknown>;
        } finally {
          client.release();
        }
      },

      async update(tableApiKey: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
        const cols = Object.keys(data);
        if (cols.length === 0) throw new Error('update: data must have at least one column');
        const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        const sql = `UPDATE "${tableApiKey}" SET ${sets} WHERE id = $${cols.length + 1} RETURNING *`;
        const client = await deps.pool.connect();
        try {
          await client.query(`SET search_path TO ${schema}, public`);
          const result = await client.query(sql, [...Object.values(data), id]);
          return result.rows[0] as Record<string, unknown>;
        } finally {
          client.release();
        }
      },
    },

    http: {
      async get(url: string, headers?: Record<string, string>): Promise<{ status: number; body: unknown }> {
        await assertSsrfSafe(url);
        const res = await fetch(url, { headers });
        const body = await res.text();
        let parsed: unknown = body;
        try { parsed = JSON.parse(body); } catch { /* keep as text */ }
        return { status: res.status, body: parsed };
      },

      async post(url: string, body: unknown, headers?: Record<string, string>): Promise<{ status: number; body: unknown }> {
        await assertSsrfSafe(url);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(body),
        });
        const responseBody = await res.text();
        let parsed: unknown = responseBody;
        try { parsed = JSON.parse(responseBody); } catch { /* keep as text */ }
        return { status: res.status, body: parsed };
      },
    },

    secrets: {
      async get(name: string): Promise<string> {
        const store = deps.secretsStore ?? {};
        if (!(name in store)) throw new Error(`Secret "${name}" not found`);
        return store[name];
      },
    },

    log: {
      info(...args: unknown[]): void {
        logs.push(`[INFO] ${args.map(String).join(' ')}`);
      },
      warn(...args: unknown[]): void {
        logs.push(`[WARN] ${args.map(String).join(' ')}`);
      },
      error(...args: unknown[]): void {
        logs.push(`[ERROR] ${args.map(String).join(' ')}`);
      },
    },

    formatINR,
    amountInWords,

    return(value: unknown): void {
      returnBox.value = value;
      returnBox.set = true;
    },
  };
}
