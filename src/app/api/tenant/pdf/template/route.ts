/**
 * POST /api/tenant/pdf/template
 * Upload a .docx template file for a form.
 * The template URL is saved in form_configs.pdf_template_url.
 *
 * multipart/form-data: { file: File, formId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { uploadToStorage } from '@/lib/pdf/generate';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const file = formData.get('file') as File | null;
  const formId = formData.get('formId') as string | null;

  if (!file || !formId) return NextResponse.json({ error: 'Missing file or formId' }, { status: 400 });

  // Validate file type
  if (!file.name.endsWith('.docx')) {
    return NextResponse.json({ error: 'Only .docx templates are supported' }, { status: 400 });
  }

  // Check form exists
  const form = await tenantQuery<{ id: string; name: string }>(ctx.schemaName,
    'SELECT id, name FROM form_configs WHERE id = $1', [formId]);
  if (form.rows.length === 0) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${tenantSlug}/templates/${formId}/${file.name}`;
  const url = await uploadToStorage(buffer, storagePath);

  // Save on form config
  await tenantQuery(ctx.schemaName,
    `UPDATE form_configs SET pdf_template_url = $1, updated_at = NOW() WHERE id = $2`,
    [url, formId]);

  return NextResponse.json({ url }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  const formId = searchParams.get('formId');
  if (!tenantSlug || !formId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'form_builder', 'edit');
  if (ctx instanceof NextResponse) return ctx;

  await tenantQuery(ctx.schemaName,
    `UPDATE form_configs SET pdf_template_url = NULL, updated_at = NOW() WHERE id = $1`, [formId]);

  return NextResponse.json({ success: true });
}
