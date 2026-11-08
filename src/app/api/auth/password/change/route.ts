/**
 * POST /api/auth/password/change
 *
 * Body: { currentPassword: string; newPassword: string }
 *
 * Changes the authenticated user's password after verifying the current one.
 * Password requirements: min 8 chars, at least 1 uppercase, at least 1 number.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/db/client';
import { tenantQuery } from '@/lib/db/client';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

function validatePassword(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter';
  if (!/\d/.test(pw)) return 'Password must contain at least one number';
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { currentPassword?: string; newPassword?: string };
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'currentPassword and newPassword are required' }, { status: 400 });
  }

  const pwError = validatePassword(newPassword);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 422 });

  if (session.user.isPlatformAdmin) {
    const admin = await prisma.platformAdmin.findUnique({ where: { id: session.user.id } });
    if (!admin) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const valid = await verifyPassword(currentPassword, admin.passwordHash);
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });

    const newHash = await hashPassword(newPassword);
    await prisma.platformAdmin.update({
      where: { id: session.user.id },
      data: { passwordHash: newHash },
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
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });

    const newHash = await hashPassword(newPassword);
    await tenantQuery(
      session.user.schemaName,
      `UPDATE users SET password_hash = $1, token_version = COALESCE(token_version, 0) + 1 WHERE id = $2`,
      [newHash, session.user.id],
    );
  }

  return NextResponse.json({ changed: true });
}
