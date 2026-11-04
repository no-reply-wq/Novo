/**
 * Migration: Add has_backing_table column to form_configs
 *
 * Run once after deploying the unified Form Builder.
 * GET /api/platform/migrations/add-backing-table-column
 *
 * Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db/client';
import { tenantQuery } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.isPlatformAdmin) {
    return NextResponse.json({ error: 'Platform admin only' }, { status: 403 });
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, schemaName: true },
    where: { status: 'ACTIVE' },
  });

  const results: Array<{ tenant: string; status: string; error?: string }> = [];

  for (const tenant of tenants) {
    try {
      await tenantQuery(
        tenant.schemaName as string,
        `ALTER TABLE form_configs ADD COLUMN IF NOT EXISTS has_backing_table BOOLEAN NOT NULL DEFAULT false`
      );
      results.push({ tenant: tenant.slug as string, status: 'ok' });
    } catch (e) {
      results.push({ tenant: tenant.slug as string, status: 'error', error: (e as Error).message });
    }
  }

  return NextResponse.json({ results, total: tenants.length });
}
