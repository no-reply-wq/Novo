/**
 * Tenant Resolver
 * 
 * Determines which tenant to serve based on the incoming hostname.
 * Checks custom_domain first, then falls back to subdomain matching.
 * Results are cached in-memory for 60 seconds to avoid DB hits on every request.
 */

import { prisma } from '../db/client';

interface TenantInfo {
  id: string;
  slug: string;
  schemaName: string;
  name: string;
  status: string;
  seatLimit: number;
  logoUrl: string | null;
  primaryColor: string | null;
}

// Simple TTL cache
const cache = new Map<string, { tenant: TenantInfo | null; expiresAt: number }>();
const TTL_MS = 60_000; // 60 seconds

export async function resolveTenantFromHost(host: string): Promise<TenantInfo | null> {
  // Strip port number if present
  const hostname = host.split(':')[0].toLowerCase();

  // Check cache
  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  let tenant: TenantInfo | null = null;

  // 1. Try custom domain match
  const byCustomDomain = await prisma.tenant.findFirst({
    where: { customDomain: hostname, domainVerified: true },
    select: {
      id: true, slug: true, schemaName: true, name: true,
      status: true, seatLimit: true, logoUrl: true, primaryColor: true,
    },
  });

  if (byCustomDomain) {
    tenant = byCustomDomain;
  } else {
    // 2. Try subdomain match: jeevaka.lrbc-erp.com → slug = "jeevaka"
    const baseDomain = process.env.BASE_DOMAIN ?? 'lrbc-erp.com';
    if (hostname.endsWith(`.${baseDomain}`)) {
      const slug = hostname.slice(0, hostname.length - baseDomain.length - 1);
      const bySlug = await prisma.tenant.findFirst({
        where: { slug },
        select: {
          id: true, slug: true, schemaName: true, name: true,
          status: true, seatLimit: true, logoUrl: true, primaryColor: true,
        },
      });
      if (bySlug) tenant = bySlug;
    }
  }

  // Store in cache
  cache.set(hostname, { tenant, expiresAt: Date.now() + TTL_MS });
  return tenant;
}

/** Resolve tenant by slug directly (for API routes that use [tenantSlug]) */
export async function resolveTenantFromSlug(slug: string): Promise<TenantInfo | null> {
  const cacheKey = `slug:${slug}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const tenant = await prisma.tenant.findFirst({
    where: { slug },
    select: {
      id: true, slug: true, schemaName: true, name: true,
      status: true, seatLimit: true, logoUrl: true, primaryColor: true,
    },
  });

  cache.set(cacheKey, { tenant, expiresAt: Date.now() + TTL_MS });
  return tenant;
}

/** Invalidate cache for a specific hostname/slug (called after tenant updates) */
export function invalidateTenantCache(slugOrHostname: string): void {
  for (const key of cache.keys()) {
    if (key.includes(slugOrHostname)) {
      cache.delete(key);
    }
  }
}

export type { TenantInfo };
