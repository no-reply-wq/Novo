import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

async function ensureWorkflows(schema: string) {
  await tenantQuery(schema, `CREATE TABLE IF NOT EXISTS _workflows (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, name TEXT NOT NULL, description TEXT DEFAULT '', table_id TEXT, trigger_type TEXT NOT NULL, trigger_config JSONB DEFAULT '{}', actions JSONB DEFAULT '[]', is_active BOOLEAN DEFAULT true, run_count INT DEFAULT 0, last_run_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await tenantQuery(schema, `CREATE TABLE IF NOT EXISTS _workflow_logs (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, workflow_id TEXT NOT NULL, trigger_row_id TEXT, status TEXT NOT NULL, result JSONB DEFAULT '{}', error TEXT, ran_at TIMESTAMPTZ DEFAULT NOW())`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await ensureWorkflows(ctx.schemaName);
  const workflows = await tenantQuery(ctx.schemaName, `SELECT w.*, t.label as table_label, t.slug as table_slug FROM _workflows w LEFT JOIN _tables t ON t.id = w.table_id ORDER BY w.created_at DESC`);
  const logs = await tenantQuery(ctx.schemaName, `SELECT * FROM _workflow_logs ORDER BY ran_at DESC LIMIT 50`);
  return NextResponse.json({ workflows: workflows.rows, logs: logs.rows });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await ensureWorkflows(ctx.schemaName);
  const body = await req.json();
  const { id, name, description='', table_id, trigger_type, trigger_config={}, actions=[], is_active=true } = body;
  if (!name || !trigger_type) return NextResponse.json({ error: 'name and trigger_type required' }, { status: 400 });
  if (id) {
    const r = await tenantQuery(ctx.schemaName, `UPDATE _workflows SET name=$1,description=$2,table_id=$3,trigger_type=$4,trigger_config=$5,actions=$6,is_active=$7 WHERE id=$8 RETURNING *`, [name,description,table_id||null,trigger_type,JSON.stringify(trigger_config),JSON.stringify(actions),is_active,id]);
    return NextResponse.json({ workflow: r.rows[0] });
  }
  const r = await tenantQuery(ctx.schemaName, `INSERT INTO _workflows (name,description,table_id,trigger_type,trigger_config,actions,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name,description,table_id||null,trigger_type,JSON.stringify(trigger_config),JSON.stringify(actions),is_active]);
  return NextResponse.json({ workflow: r.rows[0] });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const workflowId = searchParams.get('workflowId');
  if (!tenantSlug || !workflowId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;
  await tenantQuery(ctx.schemaName, `UPDATE _workflows SET is_active=false WHERE id=$1`, [workflowId]);
  return NextResponse.json({ ok: true });
}
