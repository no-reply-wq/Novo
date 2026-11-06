import { NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';

interface CheckResult {
  status: 'ok' | 'fail' | 'warn';
  latencyMs?: number;
  error?: string;
}

interface MigrationCheckResult extends CheckResult {
  status: 'ok' | 'warn';
  applied: number;
  expected: number;
}

interface MemoryCheckResult extends CheckResult {
  status: 'ok' | 'warn';
  heapUsedMb: number;
  heapTotalMb: number;
}

interface DatabaseCheckResult extends CheckResult {
  status: 'ok' | 'fail';
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: DatabaseCheckResult;
    migrations: MigrationCheckResult;
    memory: MemoryCheckResult;
  };
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function checkDatabase(): Promise<DatabaseCheckResult> {
  const start = Date.now();
  try {
    const client = await pgPool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'fail',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkMigrations(expected: number): Promise<MigrationCheckResult> {
  try {
    const client = await pgPool.connect();
    let applied = 0;
    try {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM platform.migrations`
      );
      applied = parseInt(result.rows[0]?.count ?? '0', 10);
    } finally {
      client.release();
    }
    return {
      status: applied >= expected ? 'ok' : 'warn',
      applied,
      expected,
    };
  } catch {
    return { status: 'warn', applied: 0, expected };
  }
}

function checkMemory(): MemoryCheckResult {
  const { heapUsed, heapTotal } = process.memoryUsage();
  const heapUsedMb = Math.round(heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(heapTotal / 1024 / 1024);
  const ratio = heapTotal > 0 ? heapUsed / heapTotal : 0;
  return {
    status: ratio > 0.8 ? 'warn' : 'ok',
    heapUsedMb,
    heapTotalMb,
  };
}

function countExpectedMigrations(): number {
  try {
    const { readdirSync } = require('fs') as typeof import('fs');
    const files = readdirSync(join(process.cwd(), 'migrations', 'platform'));
    return files.filter((f: string) => f.endsWith('.sql')).length;
  } catch {
    return 0;
  }
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const version = getVersion();
  const uptime = Math.floor(process.uptime());
  const timestamp = new Date().toISOString();
  const expected = countExpectedMigrations();

  const [database, migrations, memory] = await Promise.all([
    checkDatabase(),
    checkMigrations(expected),
    Promise.resolve(checkMemory()),
  ]);

  const hasCriticalFailure = database.status === 'fail';
  const hasDegradation =
    database.status !== 'ok' || migrations.status === 'warn' || memory.status === 'warn';

  const overallStatus: 'ok' | 'degraded' | 'down' = hasCriticalFailure
    ? 'down'
    : hasDegradation
    ? 'degraded'
    : 'ok';

  const body: HealthResponse = {
    status: overallStatus,
    version,
    uptime,
    timestamp,
    checks: { database, migrations, memory },
  };

  return NextResponse.json(body, { status: overallStatus === 'down' ? 503 : 200 });
}
