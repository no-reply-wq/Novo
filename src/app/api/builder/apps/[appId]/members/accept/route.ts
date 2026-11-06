/**
 * GET /api/builder/apps/[appId]/members/accept?token=<token>
 *
 * Accepts a pending invitation:
 *  1. Validates the token (not expired, status = 'pending').
 *  2. Looks up the app → tenant schema.
 *  3. Finds or creates the user in the tenant schema.
 *  4. Assigns the invited role.
 *  5. Marks the invitation as 'accepted'.
 *  6. Redirects to the app login page (or the builder if the user already has a session).
 */

import { NextRequest, NextResponse } from 'next/server';
import { pgPool, tenantQuery } from '@/lib/db/client';
import { resolveTenantFromSlug } from '@/lib/tenant/resolver';
import { hashPassword } from '@/lib/auth/password';
import { randomBytes } from 'crypto';

interface RouteContext {
  params: Promise<{ appId: string }>;
}

interface InvitationRow {
  id: string;
  app_id: string;
  email: string;
  role_id: string;
  status: string;
  expires_at: Date;
}

interface AppRow {
  id: string;
  tenant_slug: string;
  name: string;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const { appId } = await ctx.params;
  const token = new URL(req.url).searchParams.get('token');
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/error?reason=missing_token`);
  }

  // Fetch and validate invitation
  const invResult = await pgPool.query<InvitationRow>(
    `SELECT id, app_id, email, role_id, status, expires_at
     FROM public.invitations
     WHERE token = $1`,
    [token],
  );

  if (invResult.rows.length === 0) {
    return NextResponse.redirect(`${baseUrl}/error?reason=invalid_token`);
  }

  const invitation = invResult.rows[0];

  if (invitation.status !== 'pending') {
    return NextResponse.redirect(`${baseUrl}/error?reason=already_used`);
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await pgPool.query(
      `UPDATE public.invitations SET status = 'expired' WHERE id = $1`,
      [invitation.id],
    );
    return NextResponse.redirect(`${baseUrl}/error?reason=expired`);
  }

  if (invitation.app_id !== appId) {
    return NextResponse.redirect(`${baseUrl}/error?reason=invalid_token`);
  }

  // Resolve the app + tenant
  const appResult = await pgPool.query<AppRow>(
    `SELECT id, tenant_slug, name FROM public.apps WHERE id = $1`,
    [appId],
  );
  if (appResult.rows.length === 0) {
    return NextResponse.redirect(`${baseUrl}/error?reason=app_not_found`);
  }
  const app = appResult.rows[0];

  const tenant = await resolveTenantFromSlug(app.tenant_slug);
  if (!tenant) {
    return NextResponse.redirect(`${baseUrl}/error?reason=tenant_not_found`);
  }

  // Find or create the user in the tenant schema
  const existingResult = await tenantQuery<{ id: string }>(
    tenant.schemaName,
    `SELECT id FROM users WHERE email = $1`,
    [invitation.email],
  );

  let userId: string;

  if (existingResult.rows.length > 0) {
    userId = existingResult.rows[0].id;
    // Update role if different
    await tenantQuery(
      tenant.schemaName,
      `UPDATE users SET role_id = $1, updated_at = NOW() WHERE id = $2`,
      [invitation.role_id, userId],
    );
  } else {
    // Create a new user with a random temporary password.
    // The user will need to set a password via a reset-password flow.
    const tempPassword = randomBytes(16).toString('hex');
    const passwordHash = await hashPassword(tempPassword);
    const nameFromEmail = invitation.email.split('@')[0];

    const insertResult = await tenantQuery<{ id: string }>(
      tenant.schemaName,
      `INSERT INTO users (name, email, password_hash, role_id, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id`,
      [nameFromEmail, invitation.email, passwordHash, invitation.role_id],
    );
    userId = insertResult.rows[0].id;
  }

  // Mark invitation as accepted
  await pgPool.query(
    `UPDATE public.invitations SET status = 'accepted' WHERE id = $1`,
    [invitation.id],
  );

  // Redirect to the app login page for this tenant
  const loginUrl = `${baseUrl}/${app.tenant_slug}/login?invited=1&email=${encodeURIComponent(invitation.email)}`;
  return NextResponse.redirect(loginUrl);
}
