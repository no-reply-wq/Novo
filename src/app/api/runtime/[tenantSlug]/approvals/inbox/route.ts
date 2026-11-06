import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { listPendingApprovals } from '@/platform/workflows/approvals';

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const rolesParam = searchParams.get('roles');

  if (!userId) {
    return NextResponse.json({ error: 'userId query param required' }, { status: 400 });
  }

  const roles = rolesParam ? rolesParam.split(',').filter(Boolean) : [];
  const pool = getPool();
  try {
    const requests = await listPendingApprovals(pool, userId, roles);
    return NextResponse.json({ requests, count: requests.length });
  } finally {
    await pool.end();
  }
}
