/**
 * POST /api/platform/tenants/[tenantId]/impersonate
 * Creates a short-lived impersonation token and returns the login URL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db/client';
import { tenantQuery } from '@/lib/db/client';
import crypto from 'crypto';

type Params = { params: Promise<{ tenantId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { tenantId } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, schemaName: true, name: true },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const adminUser = await tenantQuery<{ id: string; email: string; name: string }>(
    tenant.schemaName,
    `SELECT id, email, name FROM users WHERE role_id IN (
      SELECT id FROM roles WHERE name ILIKE '%admin%' LIMIT 1
    ) ORDER BY created_at ASC LIMIT 1`
  );

  if (!adminUser.rows.length) {
    return NextResponse.json({ error: 'No admin user found in this tenant' }, { status: 400 });
  }

  const adminUserId = adminUser.rows[0].id;
  const adminEmail = adminUser.rows[0].email;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await tenantQuery(tenant.schemaName, `
    CREATE TABLE IF NOT EXISTS impersonate_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await tenantQuery(tenant.schemaName,
    `INSERT INTO impersonate_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, adminUserId, expiresAt]
  );

  await prisma.platformAuditLog.create({
    data: {
      adminId: session.user.id,
      tenantId,
      action: 'IMPERSONATEE_TENANT',
      meta: { targetEmail: adminEmail, slug: tenant.slug },
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const loginUrl = `${baseUrl}/${tenant.slug}/login?impersonate=${token}`;

  return NextResponse.json({ loginUrl, tenant: tenant.name, expiresAt });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
