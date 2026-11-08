/**
 * GET /api/runtime/versioning/[appId]/[tableApiKey]/[recordId]/versions/[versionNumber]
 * Returns the snapshot for one specific version.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { requireSessionTenant } from '@/lib/auth/tenant-session';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ appId: string; tableApiKey: string; recordId: string; versionNumber: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const ctx = await requireSessionTenant();
  if (ctx instanceof NextResponse) return ctx;

  const { recordId, versionNumber } = await params;
  const verNum = parseInt(versionNumber, 10);
  if (isNaN(verNum)) return NextResponse.json({ error: 'Invalid versionNumber' }, { status: 400 });

  try {
    const res = await pgPool.query(
      `SELECT * FROM platform.record_versions WHERE record_id = $1 AND version_number = $2 AND version_type = 'quote_revision'`,
      [recordId, verNum],
    );
    if (!res.rows[0]) return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    return NextResponse.json({ version: res.rows[0] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
