/**
 * Password reset flow — single-use, hashed tokens expiring after 30 minutes.
 *
 * We deliberately give the same response whether the email exists or not,
 * to avoid leaking which addresses are registered.
 */

import crypto from 'crypto';
import { prisma } from '../db/client';
import { tenantQuery } from '../db/client';
import { hashPassword } from './password';

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** SHA-256 of the raw token — stored in DB; raw token goes in the email link. */
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Generate a secure random token (URL-safe base64, 32 bytes → ~43 chars). */
function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export interface ResetRequest {
  email: string;
  tenantSlug?: string; // undefined = platform admin
}

/**
 * Create a reset token and return it.
 *
 * The caller is responsible for sending the token in the reset link.
 * Returns the raw token (do not store this — only the hash is stored).
 * Returns null when the email is not found (but callers should give the
 * same response either way to avoid enumeration).
 */
export async function createPasswordResetToken(req: ResetRequest): Promise<string | null> {
  const { email, tenantSlug } = req;

  if (tenantSlug) {
    // Tenant user
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return null;

    const result = await tenantQuery<{ id: string }>(
      tenant.schemaName,
      `SELECT id FROM users WHERE email = $1 AND active = true LIMIT 1`,
      [email.toLowerCase()]
    );
    if (!result.rows.length) return null;
  } else {
    // Platform admin
    const admin = await prisma.platformAdmin.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!admin || !admin.active) return null;
  }

  // Invalidate any existing unused tokens for this email+tenant
  await prisma.passwordResetToken.deleteMany({
    where: { email: email.toLowerCase(), tenantSlug: tenantSlug ?? null, usedAt: null },
  });

  const rawToken = generateToken();
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(rawToken),
      email: email.toLowerCase(),
      tenantSlug: tenantSlug ?? null,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return rawToken;
}

export interface RedeemResult {
  ok: true;
  email: string;
  tenantSlug: string | null;
}

/**
 * Validate a raw token and change the user's password.
 * Marks the token as used (single-use guarantee).
 * Bumps token_version to invalidate all existing sessions.
 * Throws a descriptive error on failure.
 */
export async function redeemPasswordResetToken(
  rawToken: string,
  newPassword: string
): Promise<RedeemResult> {
  if (newPassword.length < 10) {
    throw new Error('Password must be at least 10 characters');
  }

  const hash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });

  if (!record) throw new Error('Invalid or expired reset link');
  if (record.usedAt) throw new Error('This reset link has already been used');
  if (record.expiresAt < new Date()) throw new Error('This reset link has expired');

  const passwordHash = await hashPassword(newPassword);

  // Mark token used
  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  if (record.tenantSlug) {
    // Tenant user
    const tenant = await prisma.tenant.findUnique({ where: { slug: record.tenantSlug } });
    if (!tenant) throw new Error('Tenant not found');

    await tenantQuery(
      tenant.schemaName,
      `UPDATE users
         SET password_hash = $1,
             token_version  = token_version + 1,
             updated_at     = NOW()
       WHERE email = $2`,
      [passwordHash, record.email]
    );
  } else {
    // Platform admin
    await prisma.platformAdmin.update({
      where: { email: record.email },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    });
  }

  return { ok: true, email: record.email, tenantSlug: record.tenantSlug };
}
