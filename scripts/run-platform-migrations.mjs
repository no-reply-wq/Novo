#!/usr/bin/env node
// run-platform-migrations.mjs
//
// Applies SQL migrations from migrations/platform/ in filename order.
// Tracks applied files in public._platform_migrations and skips any
// already recorded. Each migration runs inside its own transaction;
// the first failure rolls back that file and stops the run.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/run-platform-migrations.mjs
//   DATABASE_URL=postgres://... node scripts/run-platform-migrations.mjs --baseline
//
// --baseline: records every pending migration file as applied WITHOUT
//   executing it. Use this exactly once against a database whose schema
//   was already created by hand (e.g. an existing environment) so that
//   future runs only apply genuinely new migrations.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  'platform'
);

const baseline = process.argv.includes('--baseline');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS public._platform_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await client.query(
    'SELECT filename FROM public._platform_migrations'
  );
  const applied = new Set(rows.map((r) => r.filename));
  const pending = files.filter((f) => !applied.has(f));

  console.log(`${pending.length} pending migration(s) (${files.length} total, ${applied.size} already applied).`);

  for (const file of pending) {
    if (baseline) {
      await client.query(
        'INSERT INTO public._platform_migrations (filename) VALUES ($1)',
        [file]
      );
      console.log(`baselined (recorded without executing): ${file}`);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO public._platform_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`\nFAILED on ${file}: ${err.message}`);
      console.error('Migration rolled back; nothing after it was run. Fix the file and re-run.');
      process.exitCode = 1;
      return;
    }
  }

  console.log(baseline ? 'Baseline complete.' : 'All migrations up to date.');
}

main()
  .catch((err) => {
    console.error(`ERROR: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
