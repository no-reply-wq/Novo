/**
 * POST /api/platform/migrations/sync-schema
 * Platform-admin only. Runs schema migrations for all ACTIVE tenants.
 * Requires isPlatformAdmin in ALL environments (no secret-param bypass).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db/client';
import { tenantQuery } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  try {
    // Always require platform-admin JWT — no environment bypass
    const token = await getToken({ req });
    if (!token || token.role !== 'platform_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch only ACTIVE tenants (correct status enum, not boolean active)
    const tenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, slug: true, schemaName: true },
    });

    const results: Array<{ slug: string; status: string; error?: string }> = [];

    for (const tenant of tenants) {
      try {
        // Run the form_fields sync migration for this tenant
        await tenantQuery(
          tenant.schemaName,
          `ALTER TABLE IF EXISTS form_fields
             ADD COLUMN IF NOT EXISTS options JSONB,
             ADD COLUMN IF NOT EXISTS validation JSONB,
             ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0`
        );
        results.push({ slug: tenant.slug, status: 'ok' });
      } catch (err) {
        results.push({
          slug: tenant.slug,
          status: 'error',
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    return NextResponse.json({ synced: results.length, results });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
