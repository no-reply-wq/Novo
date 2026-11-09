/**
 * POST /api/auth/forgot-password
 *
 * Body: { email: string; tenantSlug?: string }
 *
 * Always returns 200 with the same message regardless of whether the email
 * is registered, to avoid user enumeration.
 *
 * In production, the token should be emailed. Here we log it (or call an
 * email provider — wire in src/lib/integrations/email.ts when configured).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPasswordResetToken } from '@/lib/auth/reset-password';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/integrations/email';

/**
 * Build SMTP config from environment. When any required field is absent the
 * sendEmail call throws EmailNotConfiguredError, which we catch and log — the
 * caller still gets the generic success response, so we never leak whether the
 * address exists nor whether email delivery is configured.
 */
function smtpConfigFromEnv() {
  return {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
    secure: process.env.SMTP_SECURE,
  };
}

const GENERIC_OK = { message: 'If that address is registered you will receive a reset link shortly.' };

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function POST(req: NextRequest) {
  // Rate-limit: 3 requests per 15 min per IP
  const ip = getIp(req);
  const rl = checkRateLimit(`forgot:${ip}`, 3, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: { email?: unknown; tenantSlug?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const tenantSlug = typeof body.tenantSlug === 'string' ? body.tenantSlug.trim() : undefined;

  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  try {
    const rawToken = await createPasswordResetToken({ email, tenantSlug });

    if (rawToken) {
      // Build the reset link (use NEXTAUTH_URL env var in production)
      const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
      const params = new URLSearchParams({ token: rawToken });
      if (tenantSlug) params.set('tenant', tenantSlug);
      const resetLink = `${base}/reset-password?${params.toString()}`;

      // Dev: always log the link so local testing doesn't need SMTP.
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Forgot Password] Reset link for ${email}: ${resetLink}`);
      }

      // Attempt an actual send. If SMTP env is unconfigured, sendEmail throws
      // EmailNotConfiguredError — we log it and fall through to the generic
      // success response, never revealing config state to the client.
      try {
        await sendEmail(smtpConfigFromEnv(), {
          to: email,
          subject: 'Reset your password',
          body_html:
            `<p>We received a request to reset your password.</p>` +
            `<p><a href="${resetLink}">Click here to choose a new password</a>.</p>` +
            `<p>If you didn't request this, you can safely ignore this email.</p>`,
          body_text: `Reset your password: ${resetLink}`,
        });
      } catch (sendErr) {
        console.log(
          `[Forgot Password] Could not send reset email to ${email} ` +
          `(email delivery not configured or failed): ` +
          `${sendErr instanceof Error ? sendErr.message : String(sendErr)}`,
        );
      }
    }
  } catch (err) {
    // Log the error server-side but don't reveal it to the client
    console.error('[Forgot Password] Error:', err);
  }

  // Always return the same response
  return NextResponse.json(GENERIC_OK);
}
