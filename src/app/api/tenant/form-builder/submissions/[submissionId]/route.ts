import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const { submissionId } = await params;

  await tenantQuery(ctx.schemaName,
    'DELETE FROM form_submissions WHERE id = $1', [submissionId]);

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  const { submissionId } = await params;
  const { headerData } = await req.json().catch(() => ({}));

  await tenantQuery(ctx.schemaName,
    'UPDATE form_submissions SET header_data = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(headerData), submissionId]);

  return NextResponse.json({ success: true });
}
