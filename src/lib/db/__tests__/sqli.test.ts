/**
 * Phase 1.1 — SQL injection tests
 *
 * These tests prove that the schema-name guard in getTenantClient /
 * assertSchemaName blocks injection payloads BEFORE any network call
 * is made.  No real Postgres connection is needed.
 */

// ── import the internal guard via the module's public export ─────────────────
// assertSchemaName is not exported, so we test it indirectly through
// getTenantClient which is exported and calls assertSchemaName first.
// We mock pgPool so no real connection is attempted.

jest.mock('pg', () => {
  const connect = jest.fn().mockRejectedValue(new Error('pgPool.connect should not be called'));
  return { Pool: jest.fn(() => ({ connect })) };
});

// Mock @prisma/client so the module loads without a generated client
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({})),
}));

// Also stub env vars so the module loads without complaining
process.env.DATABASE_URL = 'postgresql://fake:fake@localhost/fake';
process.env.NEXTAUTH_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.NEXTAUTH_URL   = 'http://localhost:3000';

import { getTenantClient } from '../client';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Expect getTenantClient to throw synchronously with "Invalid schema name". */
async function expectBlocked(schemaName: string) {
  await expect(getTenantClient(schemaName)).rejects.toThrow(/Invalid schema name/);
}

/** Expect getTenantClient NOT to throw on the assertSchemaName check.
 *  (It will still fail later trying to connect, but that's fine.) */
async function expectAllowed(schemaName: string) {
  await expect(getTenantClient(schemaName)).rejects.toThrow(
    /pgPool\.connect should not be called|connect/
  );
}

// ── attack tests (must be BLOCKED) ───────────────────────────────────────────

describe('assertSchemaName blocks SQL-injection payloads', () => {
  it('blocks a double-quote escape: tenant_foo", public; DROP SCHEMA public --', async () => {
    await expectBlocked('tenant_foo", public; DROP SCHEMA public --');
  });

  it('blocks a semicolon attack: tenant_foo; DROP TABLE users --', async () => {
    await expectBlocked('tenant_foo; DROP TABLE users --');
  });

  it('blocks SQL comment injection: tenant_foo -- comment', async () => {
    await expectBlocked('tenant_foo -- comment');
  });

  it('blocks uppercase letters (not in allow-list): tenant_FOO', async () => {
    await expectBlocked('tenant_FOO');
  });

  it('blocks empty string', async () => {
    await expectBlocked('');
  });

  it('blocks a name without the required tenant_ prefix: public', async () => {
    await expectBlocked('public');
  });

  it('blocks a name without the required tenant_ prefix: pg_catalog', async () => {
    await expectBlocked('pg_catalog');
  });

  it('blocks newline injection: tenant_foo\\nDROP TABLE users', async () => {
    await expectBlocked('tenant_foo\nDROP TABLE users');
  });

  it('blocks unicode trickery: tenant_fоо (Cyrillic о)', async () => {
    // 'о' is U+043E, not ASCII 'o' — rejected by [a-z0-9_]
    await expectBlocked('tenant_fоо');
  });

  it('blocks a name that is too long (> tenant_ + 55 chars)', async () => {
    await expectBlocked('tenant_' + 'a'.repeat(56));
  });
});

// ── valid-name tests (must be ALLOWED past the guard) ────────────────────────

describe('assertSchemaName allows legitimate schema names', () => {
  it('allows tenant_acme', async () => {
    await expectAllowed('tenant_acme');
  });

  it('allows tenant_abc123', async () => {
    await expectAllowed('tenant_abc123');
  });

  it('allows tenant_my_company_2024', async () => {
    await expectAllowed('tenant_my_company_2024');
  });

  it('allows maximum-length valid name (tenant_ + 55 chars)', async () => {
    await expectAllowed('tenant_' + 'a'.repeat(55));
  });
});
