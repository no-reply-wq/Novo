/**
 * POST /api/builder/apps/import-from-marketplace
 * Imports a marketplace template into the tenant as a new app.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { importApp } from '@/platform/packaging/importer';
import { getTemplateBySlug } from '@/platform/marketplace';
import type { AppBundle, BundledScript } from '@/platform/packaging/types';
import type { AppPackage } from '@/platform/packages/types';
import type { ScriptDef } from '@/platform/contracts/rules';
import type { TableDef } from '@/platform/contracts/tables';

const BodySchema = z.object({
  templateId: z.string().min(1),
  tenant: z.string().min(1),
  newAppName: z.string().min(1).optional(),
  newAppSlug: z.string().min(1).optional(),
});

function scriptToBundle(s: ScriptDef): BundledScript {
  return {
    name: s.name ?? '',
    code: s.code ?? '',
    trigger_type: 'manual',
    config: {},
  };
}

function packageToBundle(pkg: AppPackage, exportedBy?: string): AppBundle {
  const appDef = pkg.app;
  return {
    bundleVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedBy,
    appId: appDef.id ?? '',
    appName: appDef.name,
    appSlug: appDef.slug ?? appDef.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    version: (pkg as unknown as Record<string, unknown>).version as string ?? '1.0.0',
    schema: {
      tables: (pkg.tables ?? []).map((t: TableDef) => ({
        _originalId: t.id ?? '',
        name: t.apiKey ?? t.name ?? '',
        display_name: t.name ?? '',
        config: (t as unknown as Record<string, unknown>) as Record<string, unknown>,
        fields: t.fields ?? [],
        relations: [],
        childConfigs: [],
      })),
    },
    ui: { pages: (pkg as unknown as Record<string, unknown>).pages as unknown[] ?? [], navItems: [], theme: null },
    logic: {
      workflows: pkg.workflows ?? [],
      approvalFlows: [],
      schedules: [],
      accessRules: [],
      fieldPermissions: [],
    },
    scripts: (pkg.scripts ?? []).map(scriptToBundle),
    templates: { pdf: [], email: [] },
    integrations: { stockConfigs: [], fulfilmentConfigs: [], convertToConfigs: [], bomHeaders: [], restConnectors: [] },
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { templateId, tenant: tenantSlug, newAppName, newAppSlug } = parsed.data;

  const tenantRecord = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenantRecord) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenantRecord.status === 'SUSPENDED') return NextResponse.json({ error: 'Tenant suspended' }, { status: 403 });

  const template = await getTemplateBySlug(templateId);
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const user = session.user as { id?: string };
  const bundle = packageToBundle(template as unknown as AppPackage, user.id);

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await importApp(bundle, { tenant: tenantSlug, newAppName, newAppSlug, mergeMode: 'merge' }, client);
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
