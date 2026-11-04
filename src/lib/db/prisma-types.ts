/**
 * Prisma type shims — used ONLY before `npx prisma generate` has been run.
 *
 * After running `npx prisma generate` on your machine, these types are
 * automatically replaced by the real generated types from `@prisma/client`.
 * The shapes here are derived directly from prisma/schema.prisma so they
 * are identical to what Prisma would generate.
 *
 * Import pattern:
 *   import type { Tenant } from '@/lib/db/prisma-types';
 *
 * Once the project is set up with a real generated client, you can:
 *   - Change these to re-export from '@prisma/client' directly, OR
 *   - Leave them as-is (they match exactly).
 */

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
export type DbBackend = 'POSTGRES';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  domainVerified: boolean;
  plan: string;
  seatLimit: number;
  status: TenantStatus;
  dbBackend: DbBackend;
  schemaName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  hiddenModules: unknown;
  allowedFeatures: unknown;
  createdAt: Date;
  updatedAt: Date;
  suspendedAt: Date | null;
  suspendedBy: string | null;
}

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  lastLogin: Date | null;
}

export interface PlatformAuditLog {
  id: string;
  adminId: string;
  tenantId: string | null;
  action: string;
  meta: unknown;
  createdAt: Date;
}

export interface TenantUserRef {
  id: string;
  tenantId: string;
  userId: string;
  role: string;
  createdAt: Date;
}
