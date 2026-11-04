import { NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await pgPool.query('SELECT 1');
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'error', message: 'Database unavailable' }, { status: 503 });
  }
}
