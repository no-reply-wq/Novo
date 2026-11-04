/**
 * NextAuth Configuration
 * 
 * Supports two distinct session types:
 * 1. Platform admin — LRBC staff, access to /admin/platform/*
 * 2. Tenant user — per-client ERP user, access to /:tenantSlug/*
 * 
 * The session token carries: userId, tenantId, schemaName, role, isPlatformAdmin
 */

import type { NextAuthOptions, Session, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '../db/client';
import { tenantQuery } from '../db/client';
import { resolveTenantFromSlug } from '../tenant/resolver';
import { verifyPassword } from './password';
import { checkRateLimit, clearRateLimit } from '../rate-limit';

/** Constant-time response to avoid user enumeration on wrong email vs wrong password. */
const GENERIC_AUTH_ERROR = 'Invalid email or password';
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_LIMIT = 5;

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string | null;
      email: string;
      isPlatformAdmin: boolean;
      tenantId?: string;
      tenantSlug?: string;
      schemaName?: string;
      roleId?: string;
      roleName?: string;
      tokenVersion?: number;
      /** true when TOTP has been verified in this session (platform admins only). */
      totpVerified?: boolean;
      /** true when this platform admin has TOTP enabled (requires verify step). */
      totpEnabled?: boolean;
    };
  }
  interface JWT {
    id: string;
    isPlatformAdmin: boolean;
    tenantId?: string;
    tenantSlug?: string;
    schemaName?: string;
    roleId?: string;
    roleName?: string;
    tokenVersion?: number;
    totpVerified?: boolean;
    totpEnabled?: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'platform-admin',
      name: 'Platform Admin',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password) return null;

        const ip = (req as { headers?: Record<string, string> })?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown';
        const rlKey = `login:platform:${ip}:${credentials.email.toLowerCase()}`;
        const rl = checkRateLimit(rlKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
        if (!rl.allowed) {
          throw new Error('TOO_MANY_ATTEMPTS');
        }

        const admin = await prisma.platformAdmin.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!admin || !admin.active) {
          throw new Error(GENERIC_AUTH_ERROR);
        }

        const valid = await verifyPassword(credentials.password, admin.passwordHash);
        if (!valid) {
          throw new Error(GENERIC_AUTH_ERROR);
        }

        // Clear rate-limit counter on success
        clearRateLimit(rlKey);

        // Update last login
        await prisma.platformAdmin.update({
          where: { id: admin.id },
          data: { lastLogin: new Date() },
        });

        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          isPlatformAdmin: true,
          tokenVersion: admin.tokenVersion,
          // totpVerified starts false; must be verified via /api/auth/totp-verify
          totpVerified: false,
          totpEnabled: admin.totpEnabled,
        } as User & { isPlatformAdmin: boolean; tokenVersion: number; totpVerified: boolean; totpEnabled: boolean };
      },
    }),

    CredentialsProvider({
      id: 'tenant-user',
      name: 'Tenant User',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        tenantSlug: { label: 'Tenant', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials.password || !credentials.tenantSlug) {
          return null;
        }

        const ip = (req as { headers?: Record<string, string> })?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown';
        const rlKey = `login:tenant:${ip}:${credentials.email.toLowerCase()}`;
        const rl = checkRateLimit(rlKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
        if (!rl.allowed) {
          throw new Error('TOO_MANY_ATTEMPTS');
        }

        const tenant = await resolveTenantFromSlug(credentials.tenantSlug);
        if (!tenant) {
          throw new Error(GENERIC_AUTH_ERROR);
        }

        if (tenant.status === 'SUSPENDED') {
          throw new Error('TENANT_SUSPENDED');
        }

        // Query the tenant's schema for the user
        const result = await tenantQuery<{
          id: string;
          name: string;
          email: string;
          password_hash: string;
          active: boolean;
          role_id: string;
          role_name: string;
          token_version: number;
        }>(
          tenant.schemaName,
          `SELECT u.id, u.name, u.email, u.password_hash, u.active,
                  u.role_id, r.name as role_name, u.token_version
           FROM users u
           LEFT JOIN roles r ON r.id = u.role_id
           WHERE u.email = $1 LIMIT 1`,
          [credentials.email.toLowerCase()]
        );

        const user = result.rows[0];
        if (!user || !user.active) {
          throw new Error(GENERIC_AUTH_ERROR);
        }

        const valid = await verifyPassword(credentials.password, user.password_hash);
        if (!valid) {
          throw new Error(GENERIC_AUTH_ERROR);
        }

        // Clear rate-limit counter on success
        clearRateLimit(rlKey);

        // Update last login
        await tenantQuery(
          tenant.schemaName,
          `UPDATE users SET last_login = NOW() WHERE id = $1`,
          [user.id]
        );

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isPlatformAdmin: false,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          schemaName: tenant.schemaName,
          roleId: user.role_id,
          roleName: user.role_name,
          tokenVersion: user.token_version,
        } as User & {
          isPlatformAdmin: boolean;
          tenantId: string;
          tenantSlug: string;
          schemaName: string;
          roleId: string;
          roleName: string;
          tokenVersion: number;
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as User & {
          isPlatformAdmin: boolean;
          tenantId?: string;
          tenantSlug?: string;
          schemaName?: string;
          roleId?: string;
          roleName?: string;
          tokenVersion?: number;
        };
        token.id = u.id;
        token.isPlatformAdmin = u.isPlatformAdmin ?? false;
        token.tenantId = u.tenantId;
        token.tenantSlug = u.tenantSlug;
        token.schemaName = u.schemaName;
        token.roleId = u.roleId;
        token.roleName = u.roleName;
        token.tokenVersion = u.tokenVersion ?? 0;
        token.totpVerified = (u as { totpVerified?: boolean }).totpVerified ?? false;
        token.totpEnabled = (u as { totpEnabled?: boolean }).totpEnabled ?? false;
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        email: token.email as string,
        name: token.name as string | null,
        isPlatformAdmin: token.isPlatformAdmin as boolean,
        tenantId: token.tenantId as string | undefined,
        tenantSlug: token.tenantSlug as string | undefined,
        schemaName: token.schemaName as string | undefined,
        roleId: token.roleId as string | undefined,
        roleName: token.roleName as string | undefined,
        tokenVersion: token.tokenVersion as number | undefined,
        totpVerified: token.totpVerified as boolean | undefined,
        totpEnabled: token.totpEnabled as boolean | undefined,
      };
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },

  secret: process.env.NEXTAUTH_SECRET,
};
