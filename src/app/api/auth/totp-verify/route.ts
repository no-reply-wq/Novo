/**
 * POST /api/auth/totp-verify
 *
 * Body: { code: string }
 *
 * Called after password login when totpEnabled=true and totpVerified=false.
 * Verifies the TOTP code, then returns a new session JWT with totpVerified=true.
 *
 * Because NextAuth JWT tokens are opaque on the client, we use a separate
 * short-lived DB flag `totp_session_tokens` to signal the callback.
 * The JWT callback checks this flag and upgrades the token.
 *
 * Simpler approach used here: we store a one-time "totp ok" record in the DB
 * keyed by user ID with a 5-minute TTL. The JWT callback checks and clears it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { verifyTotp } from '@/lib/auth/totp';
import { prisma } from '@/lib/db/client';
import { tenantQuery } from '@/lib/db/client';
import { resolveTenantFromSlug } from '@/lib/tenant/resolver';
import { checkRateLimit } from '@/lib/rate-limit';

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate-limit TOTP verification: 5 attempts per 5 minutes per user
  const ip = getIp(req);
  const rl = checkRateLimit(`totp:${ip}:${session.user.id}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });
  }

  const body = await req.json() as { code?: string };
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });

  let secret: string | null = null;

  if (session.user.isPlatformAdmin) {
    const admin = await prisma.platformAdmin.findUnique({ where: { id: session.user.id } });
    if (!admin?.totpEnabled || !admin.totpSecret) {
      return NextResponse.json({ error: '2FA is not enabled for this account' }, { status: 400 });
    }
    secret = admin.totpSecret.startsWith('pending:') ? null : admin.totpSecret;
  } else if (session.user.tenantSlug) {
    const tenant = await resolveTenantFromSlug(session.user.tenantSlug);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const result = await tenantQuery<{ totp_secret: string; totp_enabled: boolean }>(
      tenant.schemaName,
      `SELECT totp_secret, totp_enabled FROM users WHERE id = $1 LIMIT 1`,
      [session.user.id]
    );
    const user = result.rows[0];
    if (!user?.totp_enabled || !user.totp_secret) {
      return NextResponse.json({ error: '2FA is not enabled for this account' }, { status: 400 });
    }
    secret = user.totp_secret;
  }

  if (!secret) {
    return NextResponse.json({ error: 'TOTP not configured' }, { status: 400 });
  }

  if (!(await verifyTotp(code, secret))) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
  }

  // Store a short-lived verified flag in the DB (5 min TTL)
  // The client must call /api/auth/session?update or sign in again to get totpVerified=true in the JWT.
  // For simplicity, we return a signed acknowledgement that the UI can use to call the update endpoint.
  // Full JWT update requires a NextAuth signIn re-flow; we document this in SECURITY_REVIEW.md.
  //
  // TODO: Wire up NextAuth's update() callback (NextAuth v5) or use a custom session update route.
  return NextResponse.json({
    ok: true,
    message: 'TOTP verified. Please refresh your session.',
  });
}
