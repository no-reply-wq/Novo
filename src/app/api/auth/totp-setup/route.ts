/**
 * GET  /api/auth/totp-setup  → returns a new secret + QR code (pending confirmation)
 * POST /api/auth/totp-setup  → confirms the secret with a TOTP code, enables 2FA
 *
 * Platform admins only. The secret is not stored until POST confirms it.
 * To avoid storing the pending secret server-side we re-derive it from
 * a temporary JWT claim — simpler for now: we store it in the DB as
 * "pending" and move to enabled on confirm.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { generateTotpSecret, totpQrCodeDataUrl, verifyTotp } from '@/lib/auth/totp';
import { prisma } from '@/lib/db/client';

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await prisma.platformAdmin.findUnique({ where: { id: session.user.id } });
  if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

  // Generate a new secret (not saved yet — user must confirm first)
  const secret = generateTotpSecret();
  const qrCode = await totpQrCodeDataUrl(secret, admin.email);

  // Store it as a pending secret (we overwrite any previous pending one)
  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { totpSecret: `pending:${secret}` },
  });

  return NextResponse.json({ secret, qrCode });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { code } = await req.json() as { code?: string };
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });

  const admin = await prisma.platformAdmin.findUnique({ where: { id: session.user.id } });
  if (!admin?.totpSecret?.startsWith('pending:')) {
    return NextResponse.json({ error: 'No pending TOTP setup. Call GET first.' }, { status: 400 });
  }

  const pendingSecret = admin.totpSecret.slice('pending:'.length);
  if (!(await verifyTotp(code, pendingSecret))) {
    return NextResponse.json({ error: 'Invalid code. Please check your authenticator app.' }, { status: 400 });
  }

  // Confirm: save the secret and enable 2FA
  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: {
      totpSecret: pendingSecret,
      totpEnabled: true,
      tokenVersion: { increment: 1 }, // invalidate existing sessions
    },
  });

  return NextResponse.json({ ok: true, message: '2FA enabled successfully.' });
}
