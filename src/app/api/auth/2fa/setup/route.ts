/**
 * POST /api/auth/2fa/setup
 *
 * Generates a new TOTP secret for the authenticated user and returns
 * the provisioning QR-code URL. The secret is stored as "pending:" in
 * the DB until the user confirms via POST /api/auth/2fa/verify.
 *
 * Works for both platform admins (prisma) and tenant users (pg).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { generateTotpSecret, generateQrCodeUrl } from '@/platform/auth/totp';
import { prisma } from '@/lib/db/client';
import { tenantQuery } from '@/lib/db/client';

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const secret = generateTotpSecret();
  const qrCodeUrl = await generateQrCodeUrl(secret, session.user.email);

  if (session.user.isPlatformAdmin) {
    await prisma.platformAdmin.update({
      where: { id: session.user.id },
      data: { totpSecret: `pending:${secret}` },
    });
  } else {
    if (!session.user.schemaName) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 });
    }
    await tenantQuery(
      session.user.schemaName,
      `UPDATE users SET totp_secret = $1 WHERE id = $2`,
      [`pending:${secret}`, session.user.id],
    );
  }

  return NextResponse.json({ secret, qrCodeUrl });
}
