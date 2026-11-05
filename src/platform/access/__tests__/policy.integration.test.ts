/**
 * policy.integration.test.ts
 *
 * Integration tests: real Postgres, real RLS policies block/allow rows.
 *
 * These tests require a live Postgres connection.
 * They are skipped if the DATABASE_URL env var is not set.
 *
 * Run with: npm test -- --testPathPattern=policy.integration
 *
 * Setup assumptions:
 *   - The test DB has the platform migrations applied (001, 002)
 *   - A role 'tenant_app_role' exists in the test DB
 */

const TEST_DB_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;

// Skip all integration tests when no DB is available
const describeIntegration = TEST_DB_URL ? describe : describe.skip;

// ─── Minimal pg client wrapper for tests ─────────────────────────────────────

type Row = Record<string, unknown>;

interface TestClient {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

async function createTestClient(): Promise<TestClient> {
  // Dynamic import so the test file compiles even without pg installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client } = require('pg') as typeof import('pg');
  const client = new Client({ connectionString: TEST_DB_URL });
  await client.connect();
  return {
    query: <T extends Row>(sql: string, params?: unknown[]) =>
      client.query(sql, params) as Promise<{ rows: T[] }>,
    end: () => client.end(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describeIntegration('RLS integration: policy blocks/allows rows', () => {
  let db: TestClient;

  beforeAll(async () => {
    db = await createTestClient();
    // Create a minimal test table with tenant_id column
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.rls_test_rows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        secret_data TEXT NOT NULL
      )
    `);

    // Enable RLS on the test table
    await db.query(`ALTER TABLE public.rls_test_rows ENABLE ROW LEVEL SECURITY`);
    await db.query(`ALTER TABLE public.rls_test_rows FORCE ROW LEVEL SECURITY`);

    // Ensure tenant_app_role exists
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenant_app_role') THEN
        CREATE ROLE tenant_app_role;
      END IF;
    END $$`);

    await db.query(`GRANT SELECT ON public.rls_test_rows TO tenant_app_role`);

    // Drop any existing test policies
    await db.query(
      `DROP POLICY IF EXISTS "novo_test_tenant_policy" ON public.rls_test_rows`,
    );

    // Install a tenant-scoped RLS policy
    await db.query(`
      CREATE POLICY "novo_test_tenant_policy"
        ON public.rls_test_rows
        FOR SELECT TO tenant_app_role
        USING (tenant_id = current_setting('app.tenant_id', true))
    `);

    // Insert test rows for two tenants
    await db.query(`DELETE FROM public.rls_test_rows`);
    await db.query(`
      INSERT INTO public.rls_test_rows (tenant_id, secret_data) VALUES
        ('tenant_a', 'secret_a'),
        ('tenant_b', 'secret_b')
    `);
  });

  afterAll(async () => {
    await db.query(`DROP POLICY IF EXISTS "novo_test_tenant_policy" ON public.rls_test_rows`);
    await db.query(`DROP TABLE IF EXISTS public.rls_test_rows`);
    await db.end();
  });

  it('tenant_a user sees only tenant_a rows', async () => {
    await db.query('BEGIN');
    await db.query(`SET LOCAL "app.tenant_id" = 'tenant_a'`);
    // Switch to tenant role for the query
    await db.query(`SET LOCAL ROLE tenant_app_role`);
    const { rows } = await db.query<{ tenant_id: string; secret_data: string }>(
      `SELECT * FROM public.rls_test_rows`,
    );
    await db.query('ROLLBACK');
    expect(rows.every((r) => r.tenant_id === 'tenant_a')).toBe(true);
    expect(rows.some((r) => r.tenant_id === 'tenant_b')).toBe(false);
  });

  it('tenant_b user cannot read tenant_a rows', async () => {
    await db.query('BEGIN');
    await db.query(`SET LOCAL "app.tenant_id" = 'tenant_b'`);
    await db.query(`SET LOCAL ROLE tenant_app_role`);
    const { rows } = await db.query<{ tenant_id: string }>(
      `SELECT * FROM public.rls_test_rows WHERE tenant_id = 'tenant_a'`,
    );
    await db.query('ROLLBACK');
    expect(rows).toHaveLength(0);
  });

  it('a user with no tenant_id set sees no rows (empty string does not match)', async () => {
    await db.query('BEGIN');
    await db.query(`SET LOCAL "app.tenant_id" = ''`);
    await db.query(`SET LOCAL ROLE tenant_app_role`);
    const { rows } = await db.query(`SELECT * FROM public.rls_test_rows`);
    await db.query('ROLLBACK');
    expect(rows).toHaveLength(0);
  });
});
