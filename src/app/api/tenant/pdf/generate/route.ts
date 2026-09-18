/**
 * POST /api/tenant/pdf/generate
 *
 * Generate a filled .docx from a form submission and return a download URL.
 * The generated file is uploaded to storage and the URL is saved on the submission.
 *
 * Body: { submissionId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { generateDocx, uploadToStorage } from '@/lib/pdf/generate';
import { formatDate } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const { submissionId } = await req.json().catch(() => ({}));
  if (!submissionId) return NextResponse.json({ error: 'Missing submissionId' }, { status: 400 });

  // Load submission + form config + line items
  const [subResult, itemsResult] = await Promise.all([
    tenantQuery(ctx.schemaName,
      `SELECT fs.*, fc.name as form_name, fc.pdf_template_url, fc.slug as form_slug,
              u.name as submitted_by_name
       FROM form_submissions fs
       JOIN form_configs fc ON fc.id = fs.form_id
       LEFT JOIN users u ON u.id = fs.submitted_by
       WHERE fs.id = $1`, [submissionId]),
    tenantQuery(ctx.schemaName,
      `SELECT * FROM form_submission_items WHERE submission_id = $1 ORDER BY sort_order`,
      [submissionId]),
  ]);

  if (subResult.rows.length === 0) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  }

  const sub = subResult.rows[0] as Record<string, unknown>;

  if (!sub.pdf_template_url) {
    return NextResponse.json({ error: 'No PDF template configured for this form' }, { status: 400 });
  }

  // Parse JSON data fields
  const headerData = typeof sub.header_data === 'string'
    ? JSON.parse(sub.header_data)
    : (sub.header_data as Record<string, unknown> ?? {});

  const lineItems = (itemsResult.rows as Record<string, unknown>[]).map(item => ({
    ...(typeof item.item_data === 'string' ? JSON.parse(item.item_data) : (item.item_data as Record<string, unknown> ?? {})),
    _sort_order: item.sort_order,
  }));

  // Generate the docx
  const { buffer, filename } = await generateDocx({
    templateUrl: sub.pdf_template_url as string,
    headerData,
    lineItems,
    extraContext: {
      number: sub.document_number ?? `${sub.form_slug}-${submissionId.slice(0, 8)}`,
      formName: sub.form_name,
      submittedBy: sub.submitted_by_name,
      submittedAt: formatDate(sub.submitted_at as string),
      tenantSlug,
    },
  });

  // Upload to storage
  const storagePath = `${tenantSlug}/submissions/${submissionId}/${filename}`;
  const fileUrl = await uploadToStorage(buffer, storagePath);

  // Save URL on submission
  await tenantQuery(ctx.schemaName,
    `UPDATE form_submissions SET pdf_url = $1, updated_at = NOW() WHERE id = $2`,
    [fileUrl, submissionId]);

  return NextResponse.json({ url: fileUrl, filename });
}

/**
 * GET /api/tenant/pdf/generate?tenant=X&submissionId=Y
 * Returns existing PDF URL if already generated.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const submissionId = searchParams.get('submissionId');
  if (!tenantSlug || !submissionId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const result = await tenantQuery<{ pdf_url: string | null }>(ctx.schemaName,
    'SELECT pdf_url FROM form_submissions WHERE id = $1', [submissionId]);

  if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ url: result.rows[0].pdf_url });
}
