/**
 * Integration tests for getTenantClient / withTenantTransaction / withTenantDb
 *
 * These tests require a real Postgres instance.  They are skipped automatically
 * when DATABASE_URL is not set, so they never block the unit-test suite.
 *
 * Run locally:
 *   docker-compose -f docker-compose.test.yml up -d
 *   DATABASE_URL=postgresql://testuser:testpass@localhost:5433/testdb \
 *     npm run test:integration
 *
 * In CI the postgres service in .github/workflows/ci.yml sets DATABASE_URL.
 *
 * What is proved here that mocked tests cannot prove:
 *  - SET search_path actually routes queries to the correct tenant schema
 *  - Schemas are isolated: tenant_a data is invisible from tenant_b's client
 *  - After release the pool connection's search_path is reset to default
 *  - withTenantTransaction rolls back on error and leaves no dirty state
 *  - A double-release of the same client does not corrupt the pool
 *  - The correct schema is still visible mid-transaction (SET LOCAL inside BEGIN)
 */

import { Pool, PoolClient } from 'pg';

const DB_URL = process.env.DATABASE_URL;
const RUN = !!DB_URL;

// Skip everything gracefully when no DB is available
const describeIntegration = RUN ? describe : describe.skip;

// ─── Shared pool (separate from production pool) ────────────────────────────

let pool: Pool;

// We import the real functions only when we have a DB so the module-level
// PrismaClient instantiation (which needs `prisma generate`) doesn't crash
// the test runner in environments without the generated client.
let getTenantClient: (s: string) => Promise<PoolClient>;
let withTenantDb: <T>(s: string, cb: (c: PoolClient) => Promise<T>) => Promise<T>;
let withTenantTransaction: <T>(s: string, cb: (c: PoolClient) => Promise<T>) => Promise<T>;

beforeAll(async () => {
  if (!RUN) return;

  // Point the module at our test DB
  process.env.DATABASE_URL = DB_URL!;

  // Mock @prisma/client so the import of client.ts doesn't crash without
  // a generated client binary.
  jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => ({})) }));

  const mod = await import('../client');
  getTenantClient = mod.getTenantClient;
  withTenantDb = mod.withTenantDb;
  withTenantTransaction = mod.withTenantTransaction;

  pool = new Pool({ connectionString: DB_URL });

  // Create two isolated tenant schemas, each with a `users` table and one row
  await pool.query(`
    DROP SCHEMA IF EXISTS tenant_a CASCADE;
    DROP SCHEMA IF EXISTS tenant_b CASCADE;
    CREATE SCHEMA tenant_a;
    CREATE SCHEMA tenant_b;

    CREATE TABLE tenant_a.users (id serial PRIMARY KEY, name text NOT NULL);
    CREATE TABLE tenant_b.users (id serial PRIMARY KEY, name text NOT NULL);

    INSERT INTO tenant_a.users (name) VALUES ('alice');
    INSERT INTO tenant_b.users (name) VALUES ('bob');
  `);
});

afterAll(async () => {
  if (!RUN) return;
  await pool.query(`
    DROP SCHEMA IF EXISTS tenant_a CASCADE;
    DROP SCHEMA IF EXISTS tenant_b CASCADE;
  `);
  await pool.end();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describeIntegration('getTenantClient — schema routing', () => {
  it('routes a query to tenant_a and sees only alice', async () => {
    const client = await getTenantClient('tenant_a');
    try {
      const { rows } = await client.query('SELECT name FROM users');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('alice');
    } finally {
      client.release();
    }
  });

  it('routes a query to tenant_b and sees only bob', async () => {
    const client = await getTenantClient('tenant_b');
    try {
      const { rows } = await client.query('SELECT name FROM users');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('bob');
    } finally {
      client.release();
    }
  });

  it('schema isolation: tenant_a client cannot see tenant_b rows', async () => {
    const client = await getTenantClient('tenant_a');
    try {
      const { rows } = await client.query('SELECT name FROM users');
      const names = rows.map((r: { name: string }) => r.name);
      expect(names).not.toContain('bob');
    } finally {
      client.release();
    }
  });

  it('sequential clients for different tenants work correctly', async () => {
    const ca = await getTenantClient('tenant_a');
    const { rows: rowsA } = await ca.query('SELECT name FROM users');
    ca.release();

    const cb = await getTenantClient('tenant_b');
    const { rows: rowsB } = await cb.query('SELECT name FROM users');
    cb.release();

    expect(rowsA[0].name).toBe('alice');
    expect(rowsB[0].name).toBe('bob');
  });
});

describeIntegration('getTenantClient — search_path reset after release', () => {
  it('a raw pool connection after release sees the default search_path (public)', async () => {
    // Borrow a client, set the tenant search_path, then release it
    const client = await getTenantClient('tenant_a');
    await client.query('SELECT name FROM users'); // confirms path is set
    client.release();

    // Give the RESET a moment to complete (it's async in the release wrapper)
    await new Promise(r => setTimeout(r, 50));

    // Borrow the same (or another) connection from the pool directly
    const raw = await pool.connect();
    try {
      const { rows } = await raw.query(`SHOW search_path`);
      // After RESET, search_path must NOT be "tenant_a, public"
      expect(rows[0].search_path).not.toMatch(/tenant_a/);
    } finally {
      raw.release();
    }
  });
});

describeIntegration('getTenantClient — double-release safety', () => {
  it('releasing the same client twice does not crash or corrupt the pool', async () => {
    const client = await getTenantClient('tenant_a');
    client.release(); // first release
    client.release(); // second release — must be a no-op, not throw

    // Pool must still work after a double-release
    const next = await getTenantClient('tenant_b');
    const { rows } = await next.query('SELECT name FROM users');
    next.release();
    expect(rows[0].name).toBe('bob');
  });
});

describeIntegration('withTenantDb — convenience wrapper', () => {
  it('executes callback inside tenant schema and auto-releases', async () => {
    const rows = await withTenantDb('tenant_a', async (c) => {
      const result = await c.query('SELECT name FROM users');
      return result.rows as Array<{ name: string }>;
    });
    expect(rows[0].name).toBe('alice');
  });

  it('releases the client even when the callback throws', async () => {
    await expect(
      withTenantDb('tenant_a', async () => { throw new Error('callback error'); })
    ).rejects.toThrow('callback error');

    // Pool must still be functional afterwards
    const rows = await withTenantDb('tenant_b', async (c) => {
      const r = await c.query('SELECT name FROM users');
      return r.rows as Array<{ name: string }>;
    });
    expect(rows[0].name).toBe('bob');
  });
});

describeIntegration('withTenantTransaction — transactional isolation', () => {
  it('commits changes that are visible after the transaction', async () => {
    await withTenantTransaction('tenant_a', async (c) => {
      await c.query(`INSERT INTO users (name) VALUES ('charlie')`);
    });

    const { rows } = await pool.query('SELECT name FROM tenant_a.users ORDER BY id');
    expect(rows.map((r: { name: string }) => r.name)).toContain('charlie');

    // Clean up
    await pool.query(`DELETE FROM tenant_a.users WHERE name = 'charlie'`);
  });

  it('rolls back on error — no partial data is visible', async () => {
    await expect(
      withTenantTransaction('tenant_a', async (c) => {
        await c.query(`INSERT INTO users (name) VALUES ('dave')`);
        throw new Error('intentional rollback');
      })
    ).rejects.toThrow('intentional rollback');

    const { rows } = await pool.query('SELECT name FROM tenant_a.users WHERE name = $1', ['dave']);
    expect(rows).toHaveLength(0);
  });

  it('SET LOCAL inside BEGIN scopes the path to the transaction', async () => {
    // Verify that the search_path is active during the transaction
    let pathDuringTx = '';
    await withTenantTransaction('tenant_a', async (c) => {
      const { rows } = await c.query(`SHOW search_path`);
      pathDuringTx = rows[0].search_path as string;
    });
    expect(pathDuringTx).toMatch(/tenant_a/);
  });

  it('routes to the correct tenant schema even when called concurrently', async () => {
    // Fire two concurrent transactions for different tenants
    const [rowsA, rowsB] = await Promise.all([
      withTenantTransaction('tenant_a', async (c) => {
        const r = await c.query('SELECT name FROM users');
        return r.rows as Array<{ name: string }>;
      }),
      withTenantTransaction('tenant_b', async (c) => {
        const r = await c.query('SELECT name FROM users');
        return r.rows as Array<{ name: string }>;
      }),
    ]);
    expect(rowsA.map(r => r.name)).toContain('alice');
    expect(rowsB.map(r => r.name)).toContain('bob');
    expect(rowsA.map(r => r.name)).not.toContain('bob');
    expect(rowsB.map(r => r.name)).not.toContain('alice');
  });
});

describeIntegration('invalid schema name — assertSchemaName guard', () => {
  const attackPayloads = [
    "tenant_a'; DROP TABLE users; --",
    'tenant_a; SET search_path TO public',
    '../etc/passwd',
    'TENANT_A',
    'tenant_a_' + 'x'.repeat(56), // > 55 chars after prefix
  ];

  for (const payload of attackPayloads) {
    it(`rejects "${payload.slice(0, 50)}" before connecting`, async () => {
      await expect(getTenantClient(payload)).rejects.toThrow(/Invalid schema name/);
    });
  }
});
