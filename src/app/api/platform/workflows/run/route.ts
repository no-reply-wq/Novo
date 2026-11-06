import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { MODULE } from '@/lib/auth/modules';
import { tenantQuery } from '@/lib/db/client';
import { safeFetch } from '@/lib/ssrf';
import { ident } from '@/lib/db/sql';

// POST /api/platform/workflows/run
// Called internally after row create/update/delete
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const ctx = await requirePermission(tenantSlug, MODULE.WORKFLOWS, 'view');
  if (ctx instanceof NextResponse) return ctx;

  const { trigger_type, table_id, table_slug, row, old_row } = await req.json();

  // Find matching active workflows
  const wfResult = await tenantQuery(ctx.schemaName,
    `SELECT * FROM _workflows WHERE is_active=true AND table_id=$1 AND trigger_type=$2`,
    [table_id, trigger_type]);

  const workflows = wfResult.rows;
  if (!workflows.length) return NextResponse.json({ ran: 0 });

  let ran = 0;
  for (const wf of workflows) {
    const triggerConfig = wf.trigger_config as { field_slug?: string; from_value?: string; to_value?: string };
    // Check field-change condition
    if (trigger_type === 'on_field_change' && triggerConfig.field_slug) {
      const field = triggerConfig.field_slug;
      const newVal = String(row?.[field] ?? '');
      const oldVal = String(old_row?.[field] ?? '');
      if (newVal === oldVal) continue;
      if (triggerConfig.to_value && newVal !== triggerConfig.to_value) continue;
    }

    const actions = wf.actions as Array<{ type: string; config: Record<string, unknown> }>;
    const results: unknown[] = [];
    let hasError = false;
    let errorMsg = '';

    for (const action of actions) {
      try {
        const result = await runAction(action, { schemaName: ctx.schemaName, tableSlug: table_slug, tableId: table_id, row, oldRow: old_row });
        results.push({ type: action.type, status: 'ok', result });
      } catch (e) {
        hasError = true;
        errorMsg = (e as Error).message;
        results.push({ type: action.type, status: 'error', error: errorMsg });
      }
    }

    // Log the run
    await tenantQuery(ctx.schemaName,
      `INSERT INTO _workflow_logs (workflow_id, trigger_row_id, status, result, error) VALUES ($1,$2,$3,$4,$5)`,
      [wf.id, row?.id ?? null, hasError ? 'error' : 'success', JSON.stringify(results), errorMsg || null]);

    // Update run count
    await tenantQuery(ctx.schemaName,
      `UPDATE _workflows SET run_count=run_count+1, last_run_at=NOW() WHERE id=$1`, [wf.id]);

    ran++;
  }

  return NextResponse.json({ ran });
}

async function runAction(action: { type: string; config: Record<string, unknown> }, ctx: { schemaName: string; tableSlug: string; tableId: string; row: Record<string, unknown>; oldRow?: Record<string, unknown> }) {
  const { type, config } = action;
  const { schemaName, row } = ctx;

  // Template interpolation: replace {{field_name}} with row values
  const interpolate = (template: string) => {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(row[key] ?? ''));
  };

  if (type === 'webhook') {
    const url = interpolate(String(config.url ?? ''));
    if (!url) throw new Error('Webhook URL is required');
    const method = String(config.method ?? 'POST').toUpperCase();
    const body = config.include_row ? JSON.stringify({ row, trigger: ctx.tableSlug }) : (config.body ? interpolate(String(config.body)) : JSON.stringify({ row }));
    const response = await safeFetch(url, { method, headers: { 'Content-Type': 'application/json', ...(config.headers as Record<string, string> ?? {}) }, body: method !== 'GET' ? body : undefined });
    return { status: response.status, ok: response.ok };
  }

  if (type === 'set_field') {
    const { field_slug, value } = config;
    if (!field_slug) throw new Error('field_slug required');
    const tableIdent = ident(`ct_${ctx.tableSlug}`);
    const fieldIdent = ident(String(field_slug));
    const val = interpolate(String(value ?? ''));
    await tenantQuery(schemaName, `UPDATE ${tableIdent} SET ${fieldIdent}=$1, updated_at=NOW() WHERE id=$2`, [val, row.id]);
    return { updated: field_slug, value: val };
  }

  if (type === 'update_record') {
    const { target_table_slug, match_field, match_value_field, set_field, set_value } = config;
    if (!target_table_slug || !match_field || !set_field) throw new Error('target_table_slug, match_field, set_field required');
    const tableIdent = ident(`ct_${String(target_table_slug)}`);
    const matchFieldIdent = ident(String(match_field));
    const setFieldIdent = ident(String(set_field));
    const matchVal = row[String(match_value_field)] ?? interpolate(String(match_value_field ?? ''));
    const setVal = interpolate(String(set_value ?? ''));
    const r = await tenantQuery(schemaName, `UPDATE ${tableIdent} SET ${setFieldIdent}=$1, updated_at=NOW() WHERE ${matchFieldIdent}=$2`, [setVal, matchVal]);
    return { updated: r.rowCount };
  }

  if (type === 'create_record') {
    const { target_table_slug, field_map } = config as { target_table_slug: string; field_map: Record<string, string> };
    if (!target_table_slug || !field_map) throw new Error('target_table_slug and field_map required');
    const tableIdent = ident(`ct_${target_table_slug}`);
    const cols = Object.keys(field_map);
    // Validate all column names before building SQL
    const colIdents = cols.map(c => ident(c));
    const vals = cols.map(c => interpolate(field_map[c]));
    await tenantQuery(schemaName, `INSERT INTO ${tableIdent} (${colIdents.join(',')}) VALUES (${cols.map((_,i) => `$${i+1}`).join(',')})`, vals);
    return { created: true, in: target_table_slug };
  }

  if (type === 'email') {
    // Log only — real email requires SMTP config
    const to = interpolate(String(config.to ?? ''));
    const subject = interpolate(String(config.subject ?? ''));
    const body = interpolate(String(config.body ?? ''));
    console.log(`[Workflow Email] To: ${to} | Subject: ${subject} | Body: ${body}`);
    return { logged: true, to, subject, note: 'Email logged (configure SMTP in settings to actually send)' };
  }

  throw new Error(`Unknown action type: ${type}`);
}
