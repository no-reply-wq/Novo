/**
 * POST /api/builder/apps/[appId]/tables/[tableId]/publish?tenant=<slug>
 *
 * Accepts a full TableDef in the request body, generates minimal DDL,
 * runs it in a transaction, and records the migration.
 *
 * Auth: requires TABLES view permission for the tenant.
 * On error: rolls back and returns { error, details }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { pgPool } from '@/lib/db/client';
import { publishTableSchema } from '@/platform/data/schema-service';
import type { TableDef } from '@/platform/contracts';

type Params = { appId: string; tableId: string };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> },
): Promise<NextResponse> {
  const { appId, tableId } = await params;
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');

  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant query param' }, { status: 400 });
  }

  // Auth check
  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tableDef = body as TableDef;

  // Minimal validation
  if (typeof tableDef?.apiKey !== 'string' || !tableDef.apiKey.trim()) {
    return NextResponse.json({ error: 'tableDef.apiKey is required' }, { status: 422 });
  }
  if (!Array.isArray(tableDef?.fields)) {
    return NextResponse.json({ error: 'tableDef.fields must be an array' }, { status: 422 });
  }

  // Consistency check: tableId in URL must match body
  if (tableDef.id && tableDef.id !== tableId) {
    return NextResponse.json(
      { error: `tableId mismatch: URL has "${tableId}", body has "${tableDef.id}"` },
      { status: 422 },
    );
  }
  if (tableDef.appId && tableDef.appId !== appId) {
    return NextResponse.json(
      { error: `appId mismatch: URL has "${appId}", body has "${tableDef.appId}"` },
      { status: 422 },
    );
  }

  try {
    const result = await publishTableSchema(pgPool, tenantSlug, tableDef);
    return NextResponse.json({
      ok: true,
      created: result.created,
      statementsApplied: result.statements.length,
      warnings: result.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Schema publish failed', details: message },
      { status: 500 },
    );
type Params = { appId: string; tableId: string };
export async function POST(req: NextRequest, { params }: { params: Promise<Params> }): Promise<NextResponse> {
  const { appId, tableId } = await params;
  const tenantSlug = new URL(req.url).searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view');
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const def = body as TableDef;
  if (typeof def?.apiKey !== 'string' || !def.apiKey.trim()) return NextResponse.json({ error: 'apiKey required' }, { status: 422 });
  if (!Array.isArray(def?.fields)) return NextResponse.json({ error: 'fields must be array' }, { status: 422 });
  if (def.id && def.id !== tableId) return NextResponse.json({ error: 'tableId mismatch' }, { status: 422 });
  if (def.appId && def.appId !== appId) return NextResponse.json({ error: 'appId mismatch' }, { status: 422 });
  try {
    const r = await publishTableSchema(pgPool, tenantSlug, def);
    return NextResponse.json({ ok: true, created: r.created, statementsApplied: r.statements.length, warnings: r.warnings });
  } catch (err) {
    return NextResponse.json({ error: 'Schema publish failed', details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
