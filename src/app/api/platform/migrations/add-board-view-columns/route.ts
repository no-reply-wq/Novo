import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { runForAllTenants } from '@/lib/db/migrations/add-board-view-columns';

/**
 * POST /api/platform/migrations/add-board-view-columns
 *
 * Retroactively adds the board-view columns to every already-provisioned
 * tenant's schema. Platform-admin only, since this runs ALTER TABLE
 * against every tenant's real data. Safe to call more than once —
 * uses ADD COLUMN IF NOT EXISTS underneath.
 */
export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
  }

  const results = await runForAllTenants();
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    success: failed.length === 0,
    total: results.length,
    succeeded: results.length - failed.length,
    failed,
  });
}
