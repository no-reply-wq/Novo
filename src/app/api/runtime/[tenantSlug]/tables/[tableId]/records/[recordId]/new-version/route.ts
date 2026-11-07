/**
 * POST /api/runtime/[tenantSlug]/tables/[tableId]/records/[recordId]/new-version
 *
 * Creates a snapshot version of a record (R0, R1, R2…).
 * Body: { label?: string }
 * Auth: requires ROWS update permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { pgPool } from '@/lib/db/client';
import { saveVersion } from '@/platform/data/versions';
import { tenantSchemaName } from '@/platform/data/client';

type Params = { tenantSlug: string; tableId: string; recordId: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;

  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  let label: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    label = typeof body?.label === 'string' ? body.label : undefined;
  } catch {
    // ignore
  }

  const schema = tenantSchemaName(tenantSlug);
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');

    // Fetch current record data
    const res = await client.query<Record<string, unknown>>(
      `SELECT * FROM "${schema}"."${tableId}" WHERE id = $1::uuid LIMIT 1`,
      [recordId],
    );
    if (res.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    const data = res.rows[0];
    await saveVersion(tenantSlug, tableId, recordId, data, label, client, ctx.userId);

type Params = { tenantSlug: string; tableId: string; recordId: string };
export async function POST(req: NextRequest, { params }: { params: Promise<Params> }): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;
  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'edit');
  if (ctx instanceof NextResponse) return ctx;
  let label: string | undefined;
  try { const b = await req.json().catch(() => ({})); label = typeof b?.label === 'string' ? b.label : undefined; } catch { /* */ }
  const schema = tenantSchemaName(tenantSlug);
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<Record<string, unknown>>(`SELECT * FROM "${schema}"."${tableId}" WHERE id=$1::uuid LIMIT 1`, [recordId]);
    if (!r.rows.length) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Record not found' }, { status: 404 }); }
    await saveVersion(tenantSlug, tableId, recordId, r.rows[0], label, client, ctx.userId);
    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  } finally { client.release(); }
}
