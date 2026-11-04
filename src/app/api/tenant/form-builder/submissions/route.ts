/**
 * Form Submissions API
 * GET  — browse submissions for a form (latest revision of each thread only)
 * POST — create a new submission (with optional line items)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery, withTenantTransaction } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const SubmissionSchema = z.object({
  formId: z.string(),
  isTest: z.boolean().default(false),
  headerData: z.record(z.string(), z.unknown()),
  lineItems: z.array(z.record(z.string(), z.unknown())).default([]),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const formId = searchParams.get('formId');
  const showTest = searchParams.get('showTest') === 'true';
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') ?? '50', 10), 200);

  if (!tenantSlug || !formId) {
    return NextResponse.json({ error: 'Missing tenant or formId' }, { status: 400 });
  }

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'view');
  if (ctx instanceof NextResponse) return ctx;

  const offset = (page - 1) * pageSize;

  // Only the latest revision of each thread shows in the normal browse
  // view — older revisions are still in the table, just not cluttering
  // the main list. Full history is available via the thread endpoint.
  const [submissions, countResult] = await Promise.all([
    tenantQuery(
      ctx.schemaName,
      `SELECT fs.*, u.name as submitted_by_name
       FROM form_submissions fs
       LEFT JOIN users u ON u.id = fs.submitted_by
       WHERE fs.form_id = $1 AND ($2 OR fs.is_test = false) AND fs.is_latest = true
       ORDER BY fs.submitted_at DESC
       LIMIT $3 OFFSET $4`,
      [formId, showTest, pageSize, offset]
    ),
    tenantQuery<{ count: string }>(
      ctx.schemaName,
      `SELECT COUNT(*) as count FROM form_submissions
       WHERE form_id = $1 AND ($2 OR is_test = false) AND is_latest = true`,
      [formId, showTest]
    ),
  ]);

  return NextResponse.json({
    submissions: submissions.rows,
    total: parseInt(countResult.rows[0]?.count ?? '0', 10),
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'create');
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json().catch(() => ({}));
  const parsed = SubmissionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { formId, isTest, headerData, lineItems } = parsed.data;

  const submissionId = await withTenantTransaction(ctx.schemaName, async (client) => {
    const id = uuid();

    // thread_id = its own id: a brand-new submission is trivially the
    // first (and so far only) revision of its own thread. Revisions
    // created later via /revise share this same thread_id.
    await client.query(
      `INSERT INTO form_submissions (id, form_id, is_test, header_data, submitted_by, thread_id, revision_number, is_latest)
       VALUES ($1, $2, $3, $4, $5, $1, 1, true)`,
      [id, formId, isTest, JSON.stringify(headerData), ctx.userId]
    );

    for (let i = 0; i < lineItems.length; i++) {
      await client.query(
        `INSERT INTO form_submission_items (id, submission_id, row_index, item_data)
         VALUES ($1, $2, $3, $4)`,
        [uuid(), id, i, JSON.stringify(lineItems[i])]
      );
    }

    return id;
  });

  const result = await tenantQuery(
    ctx.schemaName,
    `SELECT fs.*, 
            COALESCE(json_agg(fsi.* ORDER BY fsi.row_index) FILTER (WHERE fsi.id IS NOT NULL), '[]') as line_items
     FROM form_submissions fs
     LEFT JOIN form_submission_items fsi ON fsi.submission_id = fs.id
     WHERE fs.id = $1
     GROUP BY fs.id`,
    [submissionId]
  );

  if (!isTest) fireNotifications(ctx.schemaName, formId, headerData, lineItems as Record<string,unknown>[], tenantSlug).catch(() => {});
  return NextResponse.json({ submission: result.rows[0] }, { status: 201 });
}

async function fireNotifications(schemaName: string, formId: string, headerData: Record<string, unknown>, lineItems: Record<string,unknown>[], tenantSlug: string) {
  try {
    const rules = await (await import('@/lib/db/client')).tenantQuery<{ id: string; integration: string; recipient_field: string | null; recipient_fixed: string | null; subject_template: string | null; body_template: string }>(
      schemaName, `SELECT * FROM notification_rules WHERE form_id = $1 AND active = true AND trigger_type = 'form_submit' LIMIT 20`, [formId]
    );
    if (!rules.rows.length) return;
    const settings = await (await import('@/lib/db/client')).tenantQuery<{ type: string; config: Record<string, unknown> }>(schemaName, `SELECT type, config FROM integration_settings WHERE enabled = true`);
    const settingsMap = Object.fromEntries(settings.rows.map(s => [s.type, s.config]));
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(headerData)) vars[k] = String(v ?? '');
    vars['line_item_count'] = String(lineItems.length);
    for (const rule of rules.rows) {
      const config = settingsMap[rule.integration];
      if (!config) continue;
      const recipient = rule.recipient_field ? vars[rule.recipient_field] : rule.recipient_fixed;
      if (!recipient) continue;
      const body = rule.body_template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
      if (rule.integration === 'email') {
        const subject = (rule.subject_template ?? 'New submission').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
        const { sendEmail } = await import('@/lib/integrations/email');
        await sendEmail(config as unknown as Parameters<typeof sendEmail>[0], { to: recipient, subject, body_html: body.replace(/\n/g, '<br/>') });
      } else if (rule.integration === 'whatsapp') {
        const { sendWhatsApp } = await import('@/lib/integrations/whatsapp');
        await sendWhatsApp(config as unknown as Parameters<typeof sendWhatsApp>[0], { to: recipient, body });
      }
    }
  } catch (e) { console.error('[notifications] fire failed:', e); }
}
