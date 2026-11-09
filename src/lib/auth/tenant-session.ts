/**
 * Tenant Session Utilities
 * 
 * API routes call these to validate the session belongs to the right tenant
 * and load user permissions before proceeding.
 */

import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './config';
import { loadUserPermissions, assertCan, type Action, type UserPermissions } from './permissions';
import { resolveTenantFromSlug, type TenantInfo } from '../tenant/resolver';
import { prisma, tenantQuery } from '../db/client';

export interface TenantContext {
  tenant: TenantInfo;
  userId: string;
  /** Alias for userId — preferred in tenant-scoped routes. */
  tenantUserId: string;
  schemaName: string;
  permissions: UserPermissions;
  roleName?: string;
}

/**
 * Resolves a full tenant context for a request.
 * Checks: session valid → tenant exists → not suspended → user belongs to tenant.
 * Returns a Response on failure, or TenantContext on success.
 */
export async function requireTenantSession(
  tenantSlug: string
): Promise<TenantContext | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Platform admins can query any tenant
  if (session.user.isPlatformAdmin) {
    // Verify the platform admin is still active and token_version matches
    const admin = await prisma.platformAdmin.findUnique({
      where: { id: session.user.id },
      select: { active: true, tokenVersion: true, totpEnabled: true },
    });
    if (!admin || !admin.active) {
      return NextResponse.json({ error: 'Account deactivated' }, { status: 401 });
    }
    if (admin.tokenVersion !== (session.user.tokenVersion ?? 0)) {
      return NextResponse.json({ error: 'Session expired — please sign in again' }, { status: 401 });
    }

    // Enforce mandatory 2FA for platform admins
    if (admin.totpEnabled && !session.user.totpVerified) {
      return NextResponse.json({ error: '2FA verification required' }, { status: 401 });
    }

    const tenant = await resolveTenantFromSlug(tenantSlug);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    // Platform admins get a synthetic "all access" permission set
    const allAccess = new Map<string, Set<Action>>();
    const allModules = ['crm', 'quotations', 'sales_orders', 'purchase', 'inventory', 'expenses', 'form_builder', 'ui_builder', 'settings', 'tables', 'workflows', 'nav', 'upload', 'relations', 'rows', 'fields', 'forms', 'pdf', 'notifications', 'search', 'reports', 'integrations'];
    const allActions: Action[] = ['view', 'create', 'edit', 'delete', 'approve', 'manage_users', 'manage_roles'];
    for (const m of allModules) {
      allAccess.set(m, new Set(allActions));
    }

    return {
      tenant,
      userId: session.user.id,
      tenantUserId: session.user.id,
      schemaName: tenant.schemaName,
      permissions: { userId: session.user.id, roleId: null, grants: allAccess },
    };
  }

  // Tenant user — must match the requested tenant
  if (session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  if (tenant.status === 'SUSPENDED') {
    return NextResponse.json(
      { error: 'Account suspended. Please contact support.' },
      { status: 403 }
    );
  }

  // Verify the tenant user is still active and token_version matches the JWT
  const userCheck = await tenantQuery<{ active: boolean; token_version: number }>(
    tenant.schemaName,
    `SELECT active, token_version FROM users WHERE id = $1 LIMIT 1`,
    [session.user.id]
  );
  const dbUser = userCheck.rows[0];
  if (!dbUser || !dbUser.active) {
    return NextResponse.json({ error: 'Account deactivated' }, { status: 401 });
  }
  if (dbUser.token_version !== (session.user.tokenVersion ?? 0)) {
    return NextResponse.json({ error: 'Session expired — please sign in again' }, { status: 401 });
  }

  const permissions = await loadUserPermissions(tenant.schemaName, session.user.id);

  return {
    tenant,
    userId: session.user.id,
    tenantUserId: session.user.id,
    schemaName: tenant.schemaName,
    permissions,
    roleName: session.user.roleName,
  };
}


/**
 * Like requireTenantSession but derives the tenant slug from the authenticated
 * session rather than requiring one to be passed explicitly. Use this in runtime
 * API routes where the tenant is implicit from the logged-in user.
 */
export async function requireSessionTenant(): Promise<TenantContext | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const slug = session.user.tenantSlug ?? (session.user.isPlatformAdmin ? null : undefined);
  if (!slug) {
    return NextResponse.json({ error: 'Tenant could not be determined from session' }, { status: 400 });
  }
  return requireTenantSession(slug);
}

/**
 * Reads the ?tenant= query param from a request's search params.
 * Returns the slug when present and non-empty, else null.
 *
 * Builder routes should treat a null result as "derive the tenant from the
 * session" (via requireSessionTenant) instead of failing with 400, so that
 * navigation that lost the query param still works for logged-in users.
 */
export function resolveTenantParam(searchParams: URLSearchParams): string | null {
  const value = searchParams.get('tenant');
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Shortcut: require tenant session + specific permission */
export async function requirePermission(
  tenantSlug: string,
  module: string,
  action: Action,
  tab?: string
): Promise<TenantContext | NextResponse> {
  const ctx = await requireTenantSession(tenantSlug);
  if (ctx instanceof NextResponse) return ctx;

  try {
    assertCan(ctx.permissions, module, action, tab);
  } catch {
    return NextResponse.json({ error: `Not allowed: ${action} ${module}` }, { status: 403 });
  }

  return ctx;
}
