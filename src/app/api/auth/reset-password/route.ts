/**
 * POST /api/auth/reset-password
 *
 * Body: { token: string; password: string; tenantSlug?: string }
 *
 * Validates the token, changes the password, and invalidates all existing
 * sessions (token_version bump).
 */

import { NextRequest, NextResponse } from 'next/server';
import { redeemPasswordResetToken } from '@/lib/auth/reset-password';
import { checkRateLimit } from '@/lib/rate-limit';

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function POST(req: NextRequest) {
  // Rate-limit: 10 attempts per 15 min per IP
  const ip = getIp(req);
  const rl = checkRateLimit(`reset:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  if (!password) return NextResponse.json({ error: 'Password is required' }, { status: 400 });

  try {
    await redeemPasswordResetToken(token, password);
    return NextResponse.json({ ok: true, message: 'Password changed. Please sign in.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Password reset failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
