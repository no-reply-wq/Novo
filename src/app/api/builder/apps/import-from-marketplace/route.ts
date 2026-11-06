/**
 * POST /api/builder/apps/import-from-marketplace
 * Body: { templateId: string, tenant: string, newAppName?: string, newAppSlug?: string }
 * Imports a marketplace template as a new app in the target tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma, pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { getTemplateBySlug } from '@/platform/marketplace';
import { importApp } from '@/platform/packaging/importer';
import type { AppBundle } from '@/platform/packaging/types';
import type { AppPackage } from '@/platform/packages/types';

const BodySchema = z.object({
  templateId: z.string().min(1),
  tenant: z.string().min(1),
  newAppName: z.string().min(1).optional(),
  newAppSlug: z.string().min(1).max(63).optional(),
});

function packageToBundle(pkg: AppPackage, exportedBy: string): AppBundle {
  return {
    version: pkg.version,
    exportedAt: pkg.exportedAt,
    exportedBy,
    app: {
      name: pkg.app.name,
      slug: pkg.app.slug,
      icon: pkg.app.iconUrl,
      description: pkg.app.description,
    },
    schema: {
      tables: pkg.tables.map(t => ({
        slug: t.slug ?? t.id,
        name: t.name,
        fields: Array.isArray((t as { fields?: unknown[] }).fields) ? (t as { fields?: unknown[] }).fields ?? [] : [],
        indexes: [],
      })),
      relations: [],
      childTableConfigs: [],
    },
    ui: {
      pages: pkg.pages,
      navItems: [],
    },
    logic: {
      workflows: pkg.workflows,
      approvalFlows: [],
      schedules: [],
      accessRules: [],
      fieldPermissions: [],
    },
    scripts: pkg.scripts.map(s => ({
      name: s.name,
      code: s.code,
      inputSchema: [],
      outputSchema: [],
      testCases: [],
    })),
    integrations: {
      pdfTemplates: pkg.templates,
      emailTemplates: [],
      stockConfigs: [],
      fulfilmentConfigs: [],
      convertToConfigs: [],
      bomHeaders: [],
      restConnectors: [],
    },
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { templateId, tenant: tenantSlug, newAppName, newAppSlug } = parsed.data;

  const user = session.user as { tenantSlug?: string; isPlatformAdmin?: boolean; id?: string };
  if (!user.isPlatformAdmin && (user.tenantSlug ?? '') !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { status: true } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  if (tenant.status === 'SUSPENDED') return NextResponse.json({ error: 'Tenant suspended' }, { status: 403 });

  const template = getTemplateBySlug(templateId);
  if (!template) {
    return NextResponse.json({ error: `Template "${templateId}" not found` }, { status: 404 });
  }

  const bundle = packageToBundle(template.package, user.id ?? 'marketplace');

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await importApp(bundle, {
      targetTenantSlug: tenantSlug,
      newAppName: newAppName ?? template.name,
      newAppSlug,
      mergeMode: 'replace',
      skipExistingTables: false,
    }, client);
    await client.query('COMMIT');
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : 'Marketplace import failed';
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    client.release();
  }
}
