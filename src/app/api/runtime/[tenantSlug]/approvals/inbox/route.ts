import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { listPendingApprovals } from '@/platform/workflows/approvals';
import { requireTenantSession } from '@/lib/auth/tenant-session';

function getPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  // Inbox is scoped to the authenticated user; identity from the session only.
  const userId = ctx.userId;
  const roles = ctx.roleName ? [ctx.roleName] : [];
  const pool = getPool();
  try {
    const requests = await listPendingApprovals(pool, userId, roles);
    return NextResponse.json({ requests, count: requests.length });
  } finally {
    await pool.end();
  }
}
