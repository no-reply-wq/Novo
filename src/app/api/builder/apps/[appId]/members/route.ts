/**
 * GET  /api/builder/apps/[appId]/members?tenant=<slug>
 *   → { members: Member[], invitations: PendingInvite[] }
 *
 * POST /api/builder/apps/[appId]/members?tenant=<slug>
 *   Body: { email: string; roleId: string }
 *   → { invitation: { id, email, token } }
 *
 * DELETE /api/builder/apps/[appId]/members?tenant=<slug>&invitationId=<id>
 *   Revokes a pending invitation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool, tenantQuery } from '@/lib/db/client';
import { resolveTenantFromSlug } from '@/lib/tenant/resolver';
import { z } from 'zod';
import { randomBytes } from 'crypto';

interface RouteContext {
  params: Promise<{ appId: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTenantSlug(req: NextRequest): string | null {
  return new URL(req.url).searchParams.get('tenant');
}

/** Send an invite email via the app's configured SMTP, or fall back to logging. */
async function sendInviteEmail(opts: {
  toEmail: string;
  inviteLink: string;
  appName: string;
  inviterName: string;
}): Promise<void> {
  const { toEmail, inviteLink, appName, inviterName } = opts;

  // Try to load nodemailer dynamically — only available when configured.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer') as typeof import('nodemailer');
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromAddress = process.env.SMTP_FROM ?? smtpUser ?? 'noreply@example.com';

    if (!smtpHost || !smtpUser || !smtpPass) {
      throw new Error('SMTP not configured');
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"${appName}" <${fromAddress}>`,
      to: toEmail,
      subject: `You've been invited to ${appName}`,
      html: `
        <p>Hi,</p>
        <p><strong>${inviterName}</strong> has invited you to join <strong>${appName}</strong>.</p>
        <p>
          <a href="${inviteLink}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;">
            Accept Invitation
          </a>
        </p>
        <p>This link expires in 7 days. If you did not expect this, ignore this email.</p>
      `,
      text: `${inviterName} invited you to ${appName}.\n\nAccept here: ${inviteLink}\n\nThis link expires in 7 days.`,
    });
  } catch {
    // Email not configured — log the invite link so dev can test without SMTP.
    console.info(`[invite] Email not sent (SMTP not configured). Invite link: ${inviteLink}`);
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const InviteSchema = z.object({
  email: z.string().email(),
  roleId: z.string().min(1),
});

// ─── Row types ────────────────────────────────────────────────────────────────

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role_id: string | null;
  role_name: string | null;
  active: boolean;
  last_login: Date | null;
  created_at: Date;
}

interface InvitationRow {
  id: string;
  email: string;
  role_id: string;
  role_name: string | null;
  token: string;
  invited_by: string;
  status: string;
  expires_at: Date;
  created_at: Date;
}

interface AppRow {
  id: string;
  tenant_slug: string;
  name: string;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantSlug = getTenantSlug(req);
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant query param' }, { status: 400 });
  }

  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const { appId } = await ctx.params;

  // Load members from the tenant schema
  const membersResult = await tenantQuery<MemberRow>(
    tenant.schemaName,
    `SELECT
       u.id, u.name, u.email, u.active, u.last_login, u.created_at,
       u.role_id,
       r.name AS role_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     ORDER BY u.created_at ASC`,
  );

  // Load pending invitations from public schema
  const invitesResult = await pgPool.query<InvitationRow>(
    `SELECT
       i.id, i.email, i.role_id, i.token, i.invited_by,
       i.status, i.expires_at, i.created_at
     FROM public.invitations i
     WHERE i.app_id = $1 AND i.status = 'pending' AND i.expires_at > NOW()
     ORDER BY i.created_at DESC`,
    [appId],
  );

  // Enrich invitations with role names from tenant schema
  const roleIds = [...new Set(invitesResult.rows.map((r) => r.role_id))];
  let roleMap: Record<string, string> = {};
  if (roleIds.length > 0) {
    const placeholders = roleIds.map((_, i) => `$${i + 1}`).join(', ');
    const rolesResult = await tenantQuery<{ id: string; name: string }>(
      tenant.schemaName,
      `SELECT id, name FROM roles WHERE id IN (${placeholders})`,
      roleIds,
    );
    for (const row of rolesResult.rows) {
      roleMap[row.id] = row.name;
    }
  }

  const members = membersResult.rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    roleId: r.role_id,
    roleName: r.role_name,
    active: r.active,
    lastLogin: r.last_login,
    createdAt: r.created_at,
  }));

  const invitations = invitesResult.rows.map((r) => ({
    id: r.id,
    email: r.email,
    roleId: r.role_id,
    roleName: roleMap[r.role_id] ?? null,
    token: r.token,
    invitedBy: r.invited_by,
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ members, invitations });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantSlug = getTenantSlug(req);
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant query param' }, { status: 400 });
  }

  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const { appId } = await ctx.params;

  // Verify the app exists and belongs to this tenant
  const appResult = await pgPool.query<AppRow>(
    `SELECT id, tenant_slug, name FROM public.apps WHERE id = $1 AND tenant_slug = $2`,
    [appId, tenantSlug],
  );
  if (appResult.rows.length === 0) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }
  const app = appResult.rows[0];

  const body: unknown = await req.json();
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, roleId } = parsed.data;

  // Verify the role exists in this tenant
  const roleResult = await tenantQuery<{ id: string; name: string }>(
    tenant.schemaName,
    `SELECT id, name FROM roles WHERE id = $1`,
    [roleId],
  );
  if (roleResult.rows.length === 0) {
    return NextResponse.json({ error: 'Role not found' }, { status: 404 });
  }

  // Expire any existing pending invite for the same email + app
  await pgPool.query(
    `UPDATE public.invitations
     SET status = 'expired'
     WHERE app_id = $1 AND email = $2 AND status = 'pending'`,
    [appId, email.toLowerCase()],
  );

  const token = randomBytes(32).toString('hex');

  const insertResult = await pgPool.query<{ id: string; email: string; token: string }>(
    `INSERT INTO public.invitations (app_id, email, role_id, token, invited_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, token`,
    [appId, email.toLowerCase(), roleId, token, session.user.id],
  );

  const invitation = insertResult.rows[0];

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const inviteLink = `${baseUrl}/api/builder/apps/${appId}/members/accept?token=${token}`;

  await sendInviteEmail({
    toEmail: email,
    inviteLink,
    appName: app.name,
    inviterName: session.user.name ?? session.user.email,
  });

  return NextResponse.json({ invitation }, { status: 201 });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantSlug = getTenantSlug(req);
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant query param' }, { status: 400 });
  }

  const { appId } = await ctx.params;
  const invitationId = new URL(req.url).searchParams.get('invitationId');
  if (!invitationId) {
    return NextResponse.json({ error: 'Missing invitationId query param' }, { status: 400 });
  }

  const result = await pgPool.query(
    `UPDATE public.invitations
     SET status = 'expired'
     WHERE id = $1 AND app_id = $2 AND status = 'pending'
     RETURNING id`,
    [invitationId, appId],
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Invitation not found or already resolved' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
