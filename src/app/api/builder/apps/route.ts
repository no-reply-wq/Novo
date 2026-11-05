/**
 * Builder Apps API
 * GET  /api/builder/apps?tenant=slug  — list apps for tenant
 * POST /api/builder/apps              — create new app
 *
 * Apps are stored in public.apps (see migrations/platform/008_builder_apps.sql).
 * We use pgPool directly since this is a public-schema table, not a Prisma model.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import type { BuilderApp } from '@/types/builder';

const CreateAppSchema = z.object({
  tenant: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

interface DbAppRow {
  id: string;
  tenant_slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function rowToBuilderApp(row: DbAppRow): BuilderApp {
  return {
    id: row.id,
    tenantSlug: row.tenant_slug,
    name: row.name,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    publishedAt: row.published_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function authorizeBuilderAccess(
  tenantSlug: string
): Promise<NextResponse | { tenantSlug: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, status: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  if (tenant.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'Tenant suspended' }, { status: 403 });
  }

  return { tenantSlug };
}

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  const auth = await authorizeBuilderAccess(tenantSlug);
  if (auth instanceof NextResponse) return auth;

  const result = await pgPool.query<DbAppRow>(
    'SELECT * FROM public.apps WHERE tenant_slug = $1 ORDER BY updated_at DESC',
    [tenantSlug]
  );

  return NextResponse.json({ apps: result.rows.map(rowToBuilderApp) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = CreateAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { tenant: tenantSlug, name, description, icon, color } = parsed.data;

  const auth = await authorizeBuilderAccess(tenantSlug);
  if (auth instanceof NextResponse) return auth;

  const id = uuid();
  const result = await pgPool.query<DbAppRow>(
    `INSERT INTO public.apps (id, tenant_slug, name, description, icon, color)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, tenantSlug, name, description ?? null, icon ?? null, color ?? null]
  );

  const app = rowToBuilderApp(result.rows[0]);
  return NextResponse.json({ app }, { status: 201 });
}
