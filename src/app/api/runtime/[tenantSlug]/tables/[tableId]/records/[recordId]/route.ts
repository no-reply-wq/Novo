/**
 * DELETE /api/runtime/[tenantSlug]/tables/[tableId]/records/[recordId]
 *
 * Soft-deletes a record (sets deleted_at / deleted_by / delete_reason).
 * Body: { reason?: string }
 * Auth: session required; tenant ownership checked via tenantSlug param.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { pgPool } from '@/lib/db/client';
import { softDelete } from '@/platform/data/softdelete';
import { logAudit } from '@/platform/data/audit';

type Params = { tenantSlug: string; tableId: string; recordId: string };

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;

  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'delete');
  if (ctx instanceof NextResponse) return ctx;

  let reason = '';
  try {
    const body = await req.json().catch(() => ({}));
    reason = typeof body?.reason === 'string' ? body.reason : '';
  } catch {
    // ignore parse errors — reason is optional
  }

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    await softDelete(tenantSlug, tableId, recordId, reason, ctx.userId, client);
    await logAudit(
      client,
      `tenant_${tenantSlug}`,
      tableId,
      recordId,
      ctx.userId,
      'DELETE',
      { deleted_reason: { before: null, after: reason || null } },
    );

type Params = { tenantSlug: string; tableId: string; recordId: string };
export async function DELETE(req: NextRequest, { params }: { params: Promise<Params> }): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;
  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'delete');
  if (ctx instanceof NextResponse) return ctx;
  let reason = '';
  try { const b = await req.json().catch(() => ({})); reason = typeof b?.reason === 'string' ? b.reason : ''; } catch { /* */ }
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await softDelete(tenantSlug, tableId, recordId, reason, ctx.userId, client);
    await logAudit(client, `tenant_${tenantSlug}`, tableId, recordId, ctx.userId, 'DELETE', { deleted_reason: { before: null, after: reason || null } });
    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
    const m = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: m }, { status: m.includes('not found') ? 404 : 500 });
  } finally { client.release(); }
}
