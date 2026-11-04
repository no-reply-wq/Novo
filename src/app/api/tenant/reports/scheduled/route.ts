import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { MODULE } from '@/lib/auth/modules';
import { z } from 'zod';

const ScheduledReportSchema = z.object({
  name: z.string().min(1).max(100),
  report_type: z.enum(['form_submissions', 'leads', 'quotations', 'inventory', 'custom_sql']),
  form_id: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  schedule: z.enum(['daily', 'weekly', 'monthly']),
  send_to: z.string().email(),
  subject: z.string().default('Scheduled Report'),
  is_active: z.boolean().optional().default(true),
});

function getNextRunAt(schedule: string): Date {
  const now = new Date();
  if (schedule === 'daily') {
    now.setDate(now.getDate() + 1);
    now.setHours(8, 0, 0, 0);
  } else if (schedule === 'weekly') {
    now.setDate(now.getDate() + 7);
    now.setHours(8, 0, 0, 0);
  } else {
    now.setMonth(now.getMonth() + 1);
    now.setDate(1);
    now.setHours(8, 0, 0, 0);
  }
  return now;
}

export async function GET(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
    const ctx = await requirePermission(tenantSlug, MODULE.REPORTS, 'view');
    if (ctx instanceof NextResponse) return ctx;

    const result = await tenantQuery(ctx.schemaName, `
      SELECT * FROM "${ctx.schemaName}".scheduled_reports ORDER BY created_at DESC
    `, []);
    return NextResponse.json(result.rows);
  } catch (e) {
    console.error('Scheduled reports GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
    const ctx = await requirePermission(tenantSlug, MODULE.REPORTS, 'create');
    if (ctx instanceof NextResponse) return ctx;

    const body = ScheduledReportSchema.parse(await req.json());
    const nextRunAt = getNextRunAt(body.schedule);

    const result = await tenantQuery(ctx.schemaName, `
      INSERT INTO "${ctx.schemaName}".scheduled_reports
        (name, report_type, form_id, filters, schedule, send_to, subject, is_active, next_run_at, created_by)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      body.name, body.report_type, body.form_id ?? null,
      JSON.stringify(body.filters), body.schedule, body.send_to,
      body.subject, body.is_active, nextRunAt.toISOString(), ctx.userId,
    ]);

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 });
    console.error('Scheduled reports POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
    const ctx = await requirePermission(tenantSlug, MODULE.REPORTS, 'edit');
    if (ctx instanceof NextResponse) return ctx;

    const { id, is_active } = await req.json();
    const result = await tenantQuery(ctx.schemaName, `
      UPDATE "${ctx.schemaName}".scheduled_reports SET is_active = $1 WHERE id = $2 RETURNING *
    `, [is_active, id]);
    return NextResponse.json(result.rows[0]);
  } catch (e) {
    console.error('Scheduled reports PATCH error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
    const ctx = await requirePermission(tenantSlug, MODULE.REPORTS, 'delete');
    if (ctx instanceof NextResponse) return ctx;
    const { id } = await req.json();
    await tenantQuery(ctx.schemaName, `DELETE FROM "${ctx.schemaName}".scheduled_reports WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Scheduled reports DELETE error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
