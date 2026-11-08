/**
 * POST /api/auth/2fa/disable
 *
 * Body: { currentPassword: string }
 *
 * Disables TOTP 2FA after re-verifying the current password.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { verifyPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/db/client';
import { tenantQuery } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { currentPassword?: string };
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  if (!currentPassword) {
    return NextResponse.json({ error: 'currentPassword is required' }, { status: 400 });
  }

  if (session.user.isPlatformAdmin) {
    const admin = await prisma.platformAdmin.findUnique({ where: { id: session.user.id } });
    if (!admin) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const valid = await verifyPassword(currentPassword, admin.passwordHash);
    if (!valid) return NextResponse.json({ error: 'Invalid password' }, { status: 403 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.platformAdmin.update as any)({
      where: { id: session.user.id },
      data: { totpSecret: null, totpEnabled: false, totpBackupCodes: [] },
    });
  } else {
    if (!session.user.schemaName) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 });
    }
    const result = await tenantQuery<{ password_hash: string }>(
      session.user.schemaName,
      `SELECT password_hash FROM users WHERE id = $1 LIMIT 1`,
      [session.user.id],
    );
    const user = result.rows[0];
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) return NextResponse.json({ error: 'Invalid password' }, { status: 403 });

    await tenantQuery(
      session.user.schemaName,
      `UPDATE users SET totp_secret = NULL, totp_enabled = false, totp_backup_codes = NULL WHERE id = $1`,
      [session.user.id],
    );
  }

  return NextResponse.json({ disabled: true });
}
