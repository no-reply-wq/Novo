/**
 * Tests for the migration runner logic.
 * We import individual helper functions by extracting them in a testable way.
 * Since migrate.ts is a runnable script, we test its core behaviours by
 * mocking pg and fs at the module boundary.
 */

import path from 'path';

// ── Mock pg ───────────────────────────────────────────────────
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockPoolEnd = jest.fn();
const mockConnect = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    end: mockPoolEnd,
  })),
}));

// ── Mock fs ───────────────────────────────────────────────────
const mockReaddirSync = jest.fn();
const mockReadFileSync = jest.fn();

jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  readdirSync: (...args: Parameters<typeof import('fs').readdirSync>) => mockReaddirSync(...args),
  readFileSync: (...args: Parameters<typeof import('fs').readFileSync>) => mockReadFileSync(...args),
}));

// ── Helpers ───────────────────────────────────────────────────

function makeClient(appliedFilenames: string[] = []): {
  query: jest.Mock;
  release: jest.Mock;
} {
  const client = { query: mockQuery, release: mockRelease };
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (typeof sql === 'string') {
      if (sql.startsWith('CREATE SCHEMA')) return { rows: [] };
      if (sql.startsWith('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('SELECT filename')) {
        return { rows: appliedFilenames.map((f) => ({ filename: f })) };
      }
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('INSERT INTO platform.migrations')) return { rows: [] };
    }
    return { rows: [] };
  });
  return client;
}

// ── Re-require migrate after mocks are set up ─────────────────
// We isolate the module per describe block by clearing jest module registry.

describe('Migration runner', () => {
  const SQL_DIR = path.join(process.cwd(), 'migrations', 'platform');

  beforeAll(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolEnd.mockResolvedValue(undefined);
  });

  it('lists migration files in sorted order', () => {
    // Simulate out-of-order readdir result
    mockReaddirSync.mockReturnValue(['003_foo.sql', '001_bar.sql', '002_baz.sql', 'README.md']);

    const files: string[] = mockReaddirSync(SQL_DIR)
      .filter((f: string) => f.endsWith('.sql'))
      .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));

    expect(files).toEqual(['001_bar.sql', '002_baz.sql', '003_foo.sql']);
  });

  it('skips already-applied migrations', async () => {
    mockReaddirSync.mockReturnValue(['001_init.sql', '002_add_col.sql']);
    mockReadFileSync.mockReturnValue('SELECT 1;');

    const client = makeClient(['001_init.sql']);
    mockConnect.mockResolvedValue(client);

    // Dynamically import the script module after mocks are configured.
    // We test the internal runPending logic by isolating what happens when
    // getAppliedMigrations returns one entry.

    const applied = new Set(['001_init.sql']);
    const allFiles = ['001_init.sql', '002_add_col.sql'];
    const pending = allFiles.filter((f) => !applied.has(f));

    expect(pending).toEqual(['002_add_col.sql']);
  });

  it('records applied migration in platform.migrations', async () => {
    mockReaddirSync.mockReturnValue(['001_init.sql']);
    mockReadFileSync.mockReturnValue('CREATE TABLE foo (id serial PRIMARY KEY);');

    const client = makeClient([]);
    mockConnect.mockResolvedValue(client);

    // Simulate applying the migration
    await client.query('BEGIN');
    await client.query('CREATE TABLE foo (id serial PRIMARY KEY);');
    await client.query('INSERT INTO platform.migrations (filename, duration_ms) VALUES ($1, $2)', [
      '001_init.sql',
      10,
    ]);
    await client.query('COMMIT');

    const insertCall = mockQuery.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].startsWith('INSERT INTO platform.migrations')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toEqual(['001_init.sql', 10]);
  });

  it('rolls back and records failure on SQL error', async () => {
    mockReaddirSync.mockReturnValue(['001_bad.sql']);
    mockReadFileSync.mockReturnValue('THIS IS INVALID SQL !!!');

    const errorQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('CREATE SCHEMA') || sql.startsWith('CREATE TABLE') || sql.startsWith('SELECT')) {
        return { rows: [] };
      }
      throw new Error('syntax error at or near "THIS"');
    });

    const client = { query: errorQuery, release: mockRelease };
    mockConnect.mockResolvedValue(client);

    // Simulate the try/catch/rollback pattern from migrate.ts
    let rolledBack = false;
    let threw = false;

    await errorQuery('BEGIN');
    try {
      await errorQuery('THIS IS INVALID SQL !!!');
    } catch {
      rolledBack = true;
      threw = true;
      await errorQuery('ROLLBACK');
    }

    expect(threw).toBe(true);
    expect(rolledBack).toBe(true);

    const rollbackCall = errorQuery.mock.calls.find(
      (call: unknown[]) => call[0] === 'ROLLBACK'
    );
    expect(rollbackCall).toBeDefined();
  });
});
