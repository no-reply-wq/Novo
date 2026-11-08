/**
 * POST /api/auth/2fa/validate
 *
 * Body: { token: string }  — also accepts { backupCode: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { verifyTotpToken, verifyBackupCode } from '@/platform/auth/totp';
import { checkRateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/db/client';
import { tenantQuery } from '@/lib/db/client';

type AdminWithBackup = {
  id: string;
  totpSecret: string | null;
  totpEnabled: boolean;
  totpBackupCodes?: string[];
};

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getIp(req);
  const rl = checkRateLimit(`2fa-validate:${ip}:${session.user.id}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });
  }

  const body = await req.json() as { token?: string; backupCode?: string };
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const backupCode = typeof body.backupCode === 'string' ? body.backupCode.trim() : '';

  if (!token && !backupCode) {
    return NextResponse.json({ error: 'token or backupCode is required' }, { status: 400 });
  }

  if (session.user.isPlatformAdmin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = await (prisma.platformAdmin.findUnique as any)({ where: { id: session.user.id } }) as AdminWithBackup | null;
    if (!admin?.totpEnabled || !admin.totpSecret) {
      return NextResponse.json({ error: '2FA not enabled' }, { status: 400 });
    }

    let valid = false;
    if (token) {
      valid = await verifyTotpToken(admin.totpSecret, token);
    } else if (backupCode && admin.totpBackupCodes?.length) {
      const result = verifyBackupCode(admin.totpBackupCodes, backupCode);
      if (result.matched) {
        valid = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.platformAdmin.update as any)({
          where: { id: admin.id },
          data: { totpBackupCodes: result.remaining },
        });
      }
    }

    if (!valid) return NextResponse.json({ error: 'Invalid code' }, { status: 422 });
  } else {
    if (!session.user.schemaName) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 });
    }
    const result = await tenantQuery<{ totp_secret: string | null; totp_enabled: boolean; totp_backup_codes: string[] | null }>(
      session.user.schemaName,
      `SELECT totp_secret, totp_enabled, totp_backup_codes FROM users WHERE id = $1 LIMIT 1`,
      [session.user.id],
    );
    const user = result.rows[0];
    if (!user?.totp_enabled || !user.totp_secret) {
      return NextResponse.json({ error: '2FA not enabled' }, { status: 400 });
    }

    let valid = false;
    if (token) {
      valid = await verifyTotpToken(user.totp_secret, token);
    } else if (backupCode && user.totp_backup_codes?.length) {
      const br = verifyBackupCode(user.totp_backup_codes, backupCode);
      if (br.matched) {
        valid = true;
        await tenantQuery(
          session.user.schemaName,
          `UPDATE users SET totp_backup_codes = $1 WHERE id = $2`,
          [br.remaining, session.user.id],
        );
      }
    }

    if (!valid) return NextResponse.json({ error: 'Invalid code' }, { status: 422 });
  }

  return NextResponse.json({ verified: true });
}
