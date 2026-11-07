/**
 * GET /api/runtime/[tenantSlug]/tables/[tableId]/records/[recordId]/history
 *
 * Returns the audit log entries for a record, newest first.
 * Auth: requires RECORDS view permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { pgPool } from '@/lib/db/client';
import { getRecordHistory } from '@/platform/data/audit';

type Params = { tenantSlug: string; tableId: string; recordId: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;

  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  try {
    const entries = await getRecordHistory(
      pgPool,
      `tenant_${tenantSlug}`,
      tableId,
      recordId,
    );
    return NextResponse.json({ ok: true, history: entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
type Params = { tenantSlug: string; tableId: string; recordId: string };
export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;
  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'view');
  if (ctx instanceof NextResponse) return ctx;
  try {
    const history = await getRecordHistory(pgPool, `tenant_${tenantSlug}`, tableId, recordId);
    return NextResponse.json({ ok: true, history });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
