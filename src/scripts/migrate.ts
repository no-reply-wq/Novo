#!/usr/bin/env node
/**
 * Migration runner for Novo platform.
 * Runs all pending SQL migrations in migrations/platform/ in filename order.
 *
 * Usage:
 *   npx tsx src/scripts/migrate.ts           # apply pending migrations
 *   npx tsx src/scripts/migrate.ts --status  # print status and exit
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Pool, PoolClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000 });

const MIGRATIONS_DIR = join(process.cwd(), 'migrations', 'platform');

const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS platform.migrations (
  id serial PRIMARY KEY,
  filename text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer
);
`;

async function ensurePlatformSchema(client: PoolClient): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS platform`);
}

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(CREATE_MIGRATIONS_TABLE);
}

async function getAppliedMigrations(client: PoolClient): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    `SELECT filename FROM platform.migrations ORDER BY filename`
  );
  return new Set(result.rows.map((r) => r.filename));
}

function listMigrationFiles(): string[] {
  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR);
  } catch (err) {
    console.error(`ERROR: Cannot read migrations directory: ${MIGRATIONS_DIR}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function applyMigration(client: PoolClient, filename: string): Promise<number> {
  const filePath = join(MIGRATIONS_DIR, filename);
  const sql = readFileSync(filePath, 'utf8');

  const start = Date.now();
  await client.query('BEGIN');
  try {
    await client.query(sql);
    const durationMs = Date.now() - start;
    await client.query(
      `INSERT INTO platform.migrations (filename, duration_ms) VALUES ($1, $2)`,
      [filename, durationMs]
    );
    await client.query('COMMIT');
    return durationMs;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function printStatus(allFiles: string[], applied: Set<string>): Promise<void> {
  console.log('\nMigration status:');
  console.log('─'.repeat(60));
  for (const f of allFiles) {
    const mark = applied.has(f) ? '✓' : '○';
    console.log(`  ${mark} ${f}`);
  }
  const pending = allFiles.filter((f) => !applied.has(f));
  console.log('─'.repeat(60));
  console.log(`  Applied: ${applied.size}/${allFiles.length}  Pending: ${pending.length}`);
  console.log('');
}

async function main(): Promise<void> {
  const statusOnly = process.argv.includes('--status');

  const client = await pool.connect();
  try {
    await ensurePlatformSchema(client);
    await ensureMigrationsTable(client);

    const allFiles = listMigrationFiles();
    const applied = await getAppliedMigrations(client);

    if (statusOnly) {
      await printStatus(allFiles, applied);
      return;
    }

    const pending = allFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('All migrations are up to date.');
      return;
    }

    console.log(`Running ${pending.length} pending migration(s)...`);

    for (const filename of pending) {
      process.stdout.write(`  Applying ${filename}... `);
      try {
        const ms = await applyMigration(client, filename);
        console.log(`done (${ms}ms)`);
      } catch (err) {
        console.log('FAILED');
        console.error(`\nERROR applying ${filename}:`);
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }

    console.log(`\nSuccessfully applied ${pending.length} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
