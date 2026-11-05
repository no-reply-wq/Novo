/**
 * Tests for src/lib/auth/tenant-session.ts — requireTenantSession()
 *
 * Covers:
 * - Inactive platform admin is rejected (401)
 * - Stale token_version for platform admin is rejected (401)
 * - Platform admin without TOTP verified is rejected when totpEnabled=true
 * - Inactive tenant user is rejected (401)
 * - Stale token_version for tenant user is rejected (401)
 * - Valid active session passes through
 */

import { NextResponse } from 'next/server';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }));

const mockPlatformAdminFindUnique = jest.fn();
const mockTenantQuery = jest.fn();
jest.mock('../db/client', () => ({
  prisma: {
    platformAdmin: {
      findUnique: (...args: unknown[]) => mockPlatformAdminFindUnique(...args),
    },
  },
  tenantQuery: (...args: unknown[]) => mockTenantQuery(...args),
}));

const mockResolveTenant = jest.fn();
jest.mock('../tenant/resolver', () => ({
  resolveTenantFromSlug: (...args: unknown[]) => mockResolveTenant(...args),
}));

jest.mock('../auth/permissions', () => ({
  loadUserPermissions: jest.fn().mockResolvedValue({ userId: 'u1', roleId: null, grants: new Map() }),
  assertCan: jest.fn(),
}));

// Import after mocks
import { requireTenantSession } from '../auth/tenant-session';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function platformAdminSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'admin-1',
      email: 'admin@example.com',
      isPlatformAdmin: true,
      tokenVersion: 3,
      totpVerified: true,
      totpEnabled: false,
      ...overrides,
    },
  };
}

function tenantUserSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-1',
      email: 'user@acme.com',
      isPlatformAdmin: false,
      tenantSlug: 'acme',
      tokenVersion: 2,
      roleName: 'admin',
      ...overrides,
    },
  };
}

const ACTIVE_TENANT = {
  id: 'tenant-1',
  slug: 'acme',
  schemaName: 'tenant_acme',
  status: 'ACTIVE',
};

// ─── Platform admin tests ────────────────────────────────────────────────────

describe('requireTenantSession — platform admin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveTenant.mockResolvedValue(ACTIVE_TENANT);
  });

  it('returns 401 when no session', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const result = await requireTenantSession('acme');
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('returns 401 for an inactive platform admin', async () => {
    mockGetServerSession.mockResolvedValue(platformAdminSession());
    mockPlatformAdminFindUnique.mockResolvedValue({
      active: false,
      tokenVersion: 3,
      totpEnabled: false,
    });
    const result = await requireTenantSession('acme');
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('returns 401 when tokenVersion is stale (password changed)', async () => {
    mockGetServerSession.mockResolvedValue(platformAdminSession({ tokenVersion: 2 }));
    mockPlatformAdminFindUnique.mockResolvedValue({
      active: true,
      tokenVersion: 3, // DB has 3, JWT has 2 → stale
      totpEnabled: false,
    });
    const result = await requireTenantSession('acme');
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('returns 401 when totpEnabled=true but totpVerified=false (2FA not completed)', async () => {
    mockGetServerSession.mockResolvedValue(
      platformAdminSession({ totpEnabled: true, totpVerified: false })
    );
    mockPlatformAdminFindUnique.mockResolvedValue({
      active: true,
      tokenVersion: 3,
      totpEnabled: true,
    });
    const result = await requireTenantSession('acme');
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('allows an active admin with matching tokenVersion and TOTP done', async () => {
    mockGetServerSession.mockResolvedValue(
      platformAdminSession({ totpEnabled: false, totpVerified: true })
    );
    mockPlatformAdminFindUnique.mockResolvedValue({
      active: true,
      tokenVersion: 3,
      totpEnabled: false,
    });
    const result = await requireTenantSession('acme');
    // Should NOT be a NextResponse — should be a TenantContext
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { userId: string }).userId).toBe('admin-1');
  });
});

// ─── Tenant user tests ───────────────────────────────────────────────────────

describe('requireTenantSession — tenant user', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveTenant.mockResolvedValue(ACTIVE_TENANT);
  });

  it('returns 403 when tenantSlug does not match', async () => {
    mockGetServerSession.mockResolvedValue(tenantUserSession({ tenantSlug: 'other' }));
    const result = await requireTenantSession('acme');
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });

  it('returns 401 for an inactive tenant user', async () => {
    mockGetServerSession.mockResolvedValue(tenantUserSession());
    mockTenantQuery.mockResolvedValue({ rows: [{ active: false, token_version: 2 }] });
    const result = await requireTenantSession('acme');
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('returns 401 when tenant user tokenVersion is stale', async () => {
    mockGetServerSession.mockResolvedValue(tenantUserSession({ tokenVersion: 1 }));
    mockTenantQuery.mockResolvedValue({ rows: [{ active: true, token_version: 2 }] }); // DB=2, JWT=1
    const result = await requireTenantSession('acme');
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('allows an active tenant user with matching tokenVersion', async () => {
    mockGetServerSession.mockResolvedValue(tenantUserSession({ tokenVersion: 2 }));
    mockTenantQuery.mockResolvedValue({ rows: [{ active: true, token_version: 2 }] });
    const result = await requireTenantSession('acme');
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { userId: string }).userId).toBe('user-1');
  });
});
