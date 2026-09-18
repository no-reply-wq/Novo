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
import { prisma } from '../db/client';

export interface TenantContext {
  tenant: TenantInfo;
  userId: string;
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
    const tenant = await resolveTenantFromSlug(tenantSlug);
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    // Platform admins get a synthetic "all access" permission set
    const allAccess = new Map<string, Set<Action>>();
    const allModules = ['crm', 'quotations', 'sales_orders', 'purchase', 'inventory', 'expenses', 'form_builder', 'ui_builder', 'settings'];
    const allActions: Action[] = ['view', 'create', 'edit', 'delete'];
    for (const m of allModules) {
      allAccess.set(m, new Set(allActions));
    }

    return {
      tenant,
      userId: session.user.id,
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

  const permissions = await loadUserPermissions(tenant.schemaName, session.user.id);

  return {
    tenant,
    userId: session.user.id,
    schemaName: tenant.schemaName,
    permissions,
    roleName: session.user.roleName,
  };
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
