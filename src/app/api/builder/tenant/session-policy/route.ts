/**
 * GET  /api/builder/tenant/session-policy   → fetch current policy
 * PUT  /api/builder/tenant/session-policy   → update policy
 *
 * Tenant-admin only. The tenantSlug is taken from the authenticated session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getSessionPolicy, saveSessionPolicy, type SessionPolicy } from '@/platform/auth/session-policy';
import { pgPool } from '@/lib/db/client';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const policy = await getSessionPolicy(session.user.tenantSlug, pgPool);
  return NextResponse.json(policy);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.tenantSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as Partial<SessionPolicy>;

  const current = await getSessionPolicy(session.user.tenantSlug, pgPool);
  const updated: SessionPolicy = {
    maxSessionDurationHours: typeof body.maxSessionDurationHours === 'number' ? body.maxSessionDurationHours : current.maxSessionDurationHours,
    idleTimeoutMinutes: typeof body.idleTimeoutMinutes === 'number' ? body.idleTimeoutMinutes : current.idleTimeoutMinutes,
    maxConcurrentSessions: typeof body.maxConcurrentSessions === 'number' ? body.maxConcurrentSessions : current.maxConcurrentSessions,
    requireReauthForSensitive: typeof body.requireReauthForSensitive === 'boolean' ? body.requireReauthForSensitive : current.requireReauthForSensitive,
  };

  await saveSessionPolicy(session.user.tenantSlug, updated, pgPool);
  return NextResponse.json(updated);
}
