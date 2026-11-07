/**
 * POST /api/builder/apps/[appId]/export  — JSON bundle (packaging format)
 * GET  /api/builder/apps/[appId]/export  — gzipped .novo bundle (lifecycle format)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { exportApp } from '@/platform/packaging/exporter';
import { exportApp as lcExportApp } from '@/platform/lifecycle/export-service';

type RouteContext = { params: Promise<{ appId: string }> };

async function authorizeExport(tenantSlug: string, appId: string): Promise<{ user: { id?: string }; error?: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { user: {}, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const user = session.user as { tenantSlug?: string; isPlatformAdmin?: boolean; id?: string };
  if (!user.isPlatformAdmin && (user.tenantSlug ?? '') !== tenantSlug) return { user, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenant) return { user, error: NextResponse.json({ error: 'Tenant not found' }, { status: 404 }) };
  if (tenant.status === 'SUSPENDED') return { user, error: NextResponse.json({ error: 'Tenant suspended' }, { status: 403 }) };
  const appRes = await pgPool.query<{ id: string }>(`SELECT id FROM public.apps WHERE id = $1 AND tenant_slug = $2`, [appId, tenantSlug]);
  if ((appRes.rowCount ?? 0) === 0) return { user, error: NextResponse.json({ error: 'App not found' }, { status: 404 }) };
  return { user };
}

export async function POST(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId } = await context.params;
  const body = await req.json().catch(() => ({})) as { tenant?: string };
  const tenantSlug = body.tenant ?? req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const { user, error } = await authorizeExport(tenantSlug, appId);
  if (error) return error;
  const client = await pgPool.connect();
  try {
    const bundle = await exportApp(appId, tenantSlug, client, user.id ?? 'system');
    const filename = bundle.app.slug + '_' + bundle.version + '.json';
    return new NextResponse(JSON.stringify(bundle, null, 2), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="' + filename + '"' } });
  } finally { client.release(); }
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { appId } = await context.params;
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });
  const { user, error } = await authorizeExport(tenantSlug, appId);
  if (error) return error;
  const appRes = await pgPool.query<{ name: string }>(`SELECT name FROM public.apps WHERE id = $1 AND tenant_slug = $2`, [appId, tenantSlug]);
  const client = await pgPool.connect();
  try {
    const buffer = await lcExportApp(appId, client, user.id ?? 'system');
    const appName = (appRes.rows[0]?.name ?? appId).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return new NextResponse(new Uint8Array(buffer), { status: 200, headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': 'attachment; filename="' + appName + '.novo"' } });
  } finally { client.release(); }
}
