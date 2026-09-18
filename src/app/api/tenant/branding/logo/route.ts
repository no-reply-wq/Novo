import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { prisma } from '@/lib/db/client';
import { uploadToStorage } from '@/lib/pdf/generate';
import { invalidateTenantCache } from '@/lib/tenant/resolver';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_users');
  if (ctx instanceof NextResponse) return ctx;

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Only PNG, JPEG, WebP, or SVG images allowed' }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 2MB)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'png';
  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${tenantSlug}/branding/logo.${ext}`;
  const url = await uploadToStorage(buffer, path, file.type);

  await prisma.tenant.update({ where: { slug: tenantSlug }, data: { logoUrl: url } });
  invalidateTenantCache(tenantSlug);

  return NextResponse.json({ url }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_users');
  if (ctx instanceof NextResponse) return ctx;

  await prisma.tenant.update({ where: { slug: tenantSlug }, data: { logoUrl: null } });
  invalidateTenantCache(tenantSlug);

  return NextResponse.json({ success: true });
}
