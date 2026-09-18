/**
 * GET /api/tenant/form-builder/submissions/thread/[threadId]
 * Every revision of a submission thread, oldest first — for the
 * revision history view.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const { threadId } = await params;

  const revisions = await tenantQuery(
    ctx.schemaName,
    `SELECT fs.*, u.name as submitted_by_name
     FROM form_submissions fs
     LEFT JOIN users u ON u.id = fs.submitted_by
     WHERE fs.thread_id = $1
     ORDER BY fs.revision_number ASC`,
    [threadId]
  );

  return NextResponse.json({ revisions: revisions.rows });
}
