/**
 * POST /api/auth/2fa/verify
 *
 * Body: { token: string }
 *
 * Verifies the TOTP token against the pending secret and, on success,
 * enables 2FA for the user and returns backup codes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { verifyTotpToken, generateBackupCodes } from '@/platform/auth/totp';
import { prisma } from '@/lib/db/client';
import { tenantQuery } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { token?: string };
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

  let pendingSecret: string | null = null;

  if (session.user.isPlatformAdmin) {
    const admin = await prisma.platformAdmin.findUnique({ where: { id: session.user.id } });
    const raw = admin?.totpSecret ?? '';
    if (!raw.startsWith('pending:')) {
      return NextResponse.json({ error: 'No pending 2FA setup. Call /api/auth/2fa/setup first.' }, { status: 400 });
    }
    pendingSecret = raw.slice('pending:'.length);
  } else {
    if (!session.user.schemaName) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 });
    }
    const result = await tenantQuery<{ totp_secret: string | null }>(
      session.user.schemaName,
      `SELECT totp_secret FROM users WHERE id = $1 LIMIT 1`,
      [session.user.id],
    );
    const raw = result.rows[0]?.totp_secret ?? '';
    if (!raw.startsWith('pending:')) {
      return NextResponse.json({ error: 'No pending 2FA setup.' }, { status: 400 });
    }
    pendingSecret = raw.slice('pending:'.length);
  }

  const valid = await verifyTotpToken(pendingSecret, token);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid TOTP code' }, { status: 422 });
  }

  const backupCodes = generateBackupCodes();

  if (session.user.isPlatformAdmin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.platformAdmin.update as any)({
      where: { id: session.user.id },
      data: {
        totpSecret: pendingSecret,
        totpEnabled: true,
        totpBackupCodes: backupCodes, // added in schema migration 010_2fa
      },
    });
  } else {
    await tenantQuery(
      session.user.schemaName!,
      `UPDATE users SET totp_secret = $1, totp_enabled = true, totp_backup_codes = $2 WHERE id = $3`,
      [pendingSecret, backupCodes, session.user.id],
    );
  }

  return NextResponse.json({ enabled: true, backupCodes });
}
