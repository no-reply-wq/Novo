/**
 * POST /api/builder/apps/import
 * Imports an AppBundle JSON into the tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { importApp } from '@/platform/packaging/importer';
import type { AppBundle } from '@/platform/packaging/types';

const ImportBodySchema = z.object({
  tenant: z.string().min(1),
  bundle: z.record(z.unknown()),
  newAppName: z.string().min(1).optional(),
  newAppSlug: z.string().min(1).optional(),
  mergeMode: z.enum(['replace', 'merge', 'skip']).default('merge'),
  skipExistingTables: z.boolean().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = ImportBodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { tenant: tenantSlug, bundle, newAppName, newAppSlug, mergeMode, skipExistingTables } = parsed.data;

  const tenantRecord = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenantRecord) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenantRecord.status === 'SUSPENDED') return NextResponse.json({ error: 'Tenant suspended' }, { status: 403 });

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await importApp(bundle as AppBundle, { tenant: tenantSlug, newAppName, newAppSlug, mergeMode, skipExistingTables }, client);
    await client.query('COMMIT');
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    client.release();
  }
}
