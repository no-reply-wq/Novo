/**
 * GET /api/health
 * Returns 200 with service status when healthy, 503 when degraded.
 * Used by uptime monitors and load balancers.
 */
import { NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';

export const runtime = 'nodejs';

interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  checks: {
    database: 'ok' | 'error';
    dbLatencyMs?: number;
  };
}

export async function GET(): Promise<NextResponse> {
  const start = Date.now();
  let dbStatus: 'ok' | 'error' = 'error';
  let dbLatencyMs: number | undefined;

  try {
    await pgPool.query('SELECT 1');
    dbStatus = 'ok';
    dbLatencyMs = Date.now() - start;
  } catch {
    // DB is down — still return a response, just 503
  }

  const status: HealthStatus = {
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.0.0',
    checks: { database: dbStatus, dbLatencyMs },
  };

  return NextResponse.json(status, {
    status: status.status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
