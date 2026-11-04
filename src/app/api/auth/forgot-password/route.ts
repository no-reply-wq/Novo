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

      // Log to console in dev; in production this should call your email provider.
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Forgot Password] Reset link for ${email}: ${resetLink}`);
      } else {
        // TODO: call src/lib/integrations/email.ts sendEmail(...)
        console.log(`[Forgot Password] Send reset link to ${email} (email provider not configured)`);
      }
    }
  } catch (err) {
    // Log the error server-side but don't reveal it to the client
    console.error('[Forgot Password] Error:', err);
  }

  // Always return the same response
  return NextResponse.json(GENERIC_OK);
}
