import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { runForAllTenants } from '@/lib/db/migrations/add-revisioning-columns';

/**
 * POST /api/platform/migrations/add-revisioning-columns
 * Platform-admin only. Safe to call more than once.
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
