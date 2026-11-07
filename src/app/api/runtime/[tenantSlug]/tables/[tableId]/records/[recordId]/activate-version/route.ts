/**
 * POST /api/runtime/[tenantSlug]/tables/[tableId]/records/[recordId]/activate-version
 *
 * Restores a record to a saved version snapshot.
 * Body: { versionNumber: number }
 * Auth: requires ROWS update permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { pgPool } from '@/lib/db/client';
import { restoreVersion } from '@/platform/data/versions';
import { logAudit, buildDiff } from '@/platform/data/audit';
import { tenantSchemaName } from '@/platform/data/client';

type Params = { tenantSlug: string; tableId: string; recordId: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;

  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'edit');
  if (ctx instanceof NextResponse) return ctx;

  let versionNumber: number | undefined;
  try {
    const body = await req.json();
    versionNumber = typeof body?.versionNumber === 'number' ? body.versionNumber : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (versionNumber === undefined || !Number.isInteger(versionNumber)) {
    return NextResponse.json({ error: 'versionNumber (integer) is required' }, { status: 422 });
  }

  const schema = tenantSchemaName(tenantSlug);
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');

    // Current record state
    const curRes = await client.query<Record<string, unknown>>(
      `SELECT * FROM "${schema}"."${tableId}" WHERE id = $1::uuid LIMIT 1`,
      [recordId],
    );
    if (curRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }
    const before = curRes.rows[0];

    // Fetch snapshot
    const snapshot = await restoreVersion(tenantSlug, tableId, recordId, versionNumber, client);

    // Build SET clause from snapshot (exclude system columns)
    const SKIP = new Set([
      'id', '_version', '_created_at', '_created_by',
      '_updated_at', '_updated_by', 'deleted_at', 'deleted_by', 'delete_reason',
    ]);
    const setCols = Object.keys(snapshot).filter(k => !SKIP.has(k));

    if (setCols.length > 0) {
      const setClause = setCols.map((col, i) => `"${col.replace(/"/g, '""')}" = $${i + 2}`).join(', ');
      const values = setCols.map(col => (snapshot[col] !== undefined ? snapshot[col] : null));
      await client.query(
        `UPDATE "${schema}"."${tableId}"
            SET ${setClause},
                _updated_at = now(),
                _updated_by = $1::uuid,
                _version = _version + 1
          WHERE id = $${setCols.length + 2}::uuid`,
        [ctx.userId, ...values, recordId],
      );
    }

    const diff = buildDiff(
      before as Record<string, unknown>,
      snapshot as Record<string, unknown>,
    );
    await logAudit(
      client,
      `tenant_${tenantSlug}`,
      tableId,
      recordId,
      ctx.userId,
      'UPDATE',
      diff,
    );

type Params = { tenantSlug: string; tableId: string; recordId: string };
export async function POST(req: NextRequest, { params }: { params: Promise<Params> }): Promise<NextResponse> {
  const { tenantSlug, tableId, recordId } = await params;
  const ctx = await requirePermission(tenantSlug, MODULE.ROWS, 'edit');
  if (ctx instanceof NextResponse) return ctx;
  let versionNumber: number | undefined;
  try { const b = await req.json(); versionNumber = typeof b?.versionNumber === 'number' ? b.versionNumber : undefined; }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!Number.isInteger(versionNumber)) return NextResponse.json({ error: 'versionNumber required' }, { status: 422 });
  const schema = tenantSchemaName(tenantSlug);
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query<Record<string, unknown>>(`SELECT * FROM "${schema}"."${tableId}" WHERE id=$1::uuid LIMIT 1`, [recordId]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return NextResponse.json({ error: 'Record not found' }, { status: 404 }); }
    const before = cur.rows[0];
    const snap = await restoreVersion(tenantSlug, tableId, recordId, versionNumber as number, client);
    const SKIP = new Set(['id','_version','_created_at','_created_by','_updated_at','_updated_by','deleted_at','deleted_by','delete_reason']);
    const cols = Object.keys(snap).filter(k => !SKIP.has(k));
    if (cols.length > 0) {
      const setClause = cols.map((c, i) => `"${c.replace(/"/g,'""')}"=$${i+2}`).join(', ');
      await client.query(`UPDATE "${schema}"."${tableId}" SET ${setClause},_updated_at=now(),_updated_by=$1::uuid,_version=_version+1 WHERE id=$${cols.length+2}::uuid`, [ctx.userId, ...cols.map(c => snap[c] ?? null), recordId]);
    }
    await logAudit(client, `tenant_${tenantSlug}`, tableId, recordId, ctx.userId, 'UPDATE', buildDiff(before, snap as Record<string,unknown>));
    await client.query('COMMIT');
    return NextResponse.json({ ok: true, restoredVersion: versionNumber });
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
