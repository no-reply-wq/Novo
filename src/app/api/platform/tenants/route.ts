/**
 * Platform Tenant Management API
 * Only accessible to platform admins.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db/client';
import { provisionTenant, tenantSlugToSchemaName } from '@/lib/db/provision-tenant';
import { generateSlug } from '@/lib/utils/slug';
import { z } from 'zod';

function requirePlatformAdmin(session: ReturnType<typeof getServerSession> extends Promise<infer T> ? T : never) {
  if (!session?.user?.isPlatformAdmin) {
    throw new Error('FORBIDDEN');
  }
}

// GET /api/platform/tenants — list all tenants
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const tenants = await prisma.tenant.findMany({
    where: {
      ...(status ? { status: status as 'ACTIVE' | 'SUSPENDED' | 'TRIAL' } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, slug: true, plan: true, seatLimit: true,
      status: true, dbBackend: true, customDomain: true, domainVerified: true,
      createdAt: true, suspendedAt: true, logoUrl: true,
    },
  });

  return NextResponse.json({ tenants });
}

const CreateTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(63).regex(/^[a-z0-9-]+$/).optional(),
  plan: z.enum(['starter', 'pro', 'enterprise']).default('starter'),
  seatLimit: z.number().int().min(1).max(1000).default(5),
  dbBackend: z.enum(['POSTGRES', 'MONGODB', 'BIGQUERY']).default('POSTGRES'),
  adminEmail: z.string().email(),
  adminName: z.string().min(2),
  adminPassword: z.string().min(8),
  primaryColor: z.string().optional(),
});

// POST /api/platform/tenants — create a new tenant
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateTenantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const data = parsed.data;

  // NOTE: only Postgres is actually implemented right now — the data
  // layer (src/lib/db/client.ts) only knows how to talk to Postgres.
  // Selecting Mongo/BigQuery used to be silently ignored and this
  // tenant would get Postgres anyway with no indication that happened,
  // which is worse than the feature not existing at all — someone
  // could believe a client's data lives somewhere it doesn't. Until
  // real per-backend adapters exist, reject the request outright with
  // a clear reason instead.
  if (data.dbBackend !== 'POSTGRES') {
    return NextResponse.json({
      error: `The ${data.dbBackend} backend isn't implemented yet — only PostgreSQL is currently supported. ` +
             `Selecting it here would silently provision Postgres instead, which we don't want to do without telling you.`,
    }, { status: 422 });
  }

  const slug = data.slug ?? generateSlug(data.name);
  const schemaName = tenantSlugToSchemaName(slug);

  // Check slug uniqueness
  const existing = await prisma.tenant.findFirst({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });
  }

  try {
    // Create the tenant record first
    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        slug,
        schemaName,
        plan: data.plan,
        seatLimit: data.seatLimit,
        dbBackend: data.dbBackend,
        status: 'ACTIVE',
        primaryColor: data.primaryColor,
      },
    });

    // Provision the database schema
    const adminUserId = await provisionTenant({
      tenantId: tenant.id,
      schemaName,
      adminEmail: data.adminEmail,
      adminName: data.adminName,
      adminPassword: data.adminPassword,
    });

    // Audit log
    await prisma.platformAuditLog.create({
      data: {
        adminId: session.user.id,
        tenantId: tenant.id,
        action: 'CREATE_TENANT',
        meta: { slug, plan: data.plan, seatLimit: data.seatLimit },
      },
    });

    // Add user cross-reference
    await prisma.tenantUserRef.create({
      data: {
        tenantId: tenant.id,
        email: data.adminEmail,
        role: 'admin',
      },
    });

    return NextResponse.json({
      tenant,
      adminUserId,
      loginUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/${slug}/login`,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Provisioning failed: ${message}` }, { status: 500 });
  }
}
