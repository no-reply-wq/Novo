/**
 * POST /api/builder/templates/[templateId]/install
 *
 * Creates a new app for the current tenant from the given template bundle.
 * The app starts as a draft; the caller can customize and publish it afterwards.
 *
 * Body (JSON):
 *   tenant  — tenant slug (required)
 *   name?   — override the app name (defaults to template name)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getTemplate } from '@/platform/templates';
import logger from '@/lib/logger';

type Params = Promise<{ templateId: string }>;

const InstallSchema = z.object({
  tenant: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Params },
) {
  try {
    const { templateId } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as unknown;
    const parsed = InstallSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const { tenant: tenantSlug, name: nameOverride } = parsed.data;

    // Verify the session user belongs to the requested tenant
    if (session.user.tenantSlug !== tenantSlug) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const template = getTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: `Template '${templateId}' not found` }, { status: 404 });
    }

    const appId = randomUUID();
    const appName = nameOverride ?? template.name;

    // Insert the new app row
    await pgPool.query(
      `INSERT INTO public.apps (id, tenant_slug, name, description, icon, color)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        appId,
        tenantSlug,
        appName,
        template.description,
        template.icon,
        template.color,
      ],
    );

    // Persist the template bundle as the initial app bundle (draft version 1)
    await pgPool.query(
      `INSERT INTO public.app_bundles (id, app_id, tenant_slug, version, bundle, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT DO NOTHING`,
      [randomUUID(), appId, tenantSlug, 1, JSON.stringify(template.bundle)],
    );

    logger.info('Template installed', { templateId, appId, tenantSlug });

    return NextResponse.json(
      {
        app: {
          id: appId,
          name: appName,
          tenantSlug,
          description: template.description,
          icon: template.icon,
          color: template.color,
          templateId,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error('POST /api/builder/templates/[templateId]/install failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
