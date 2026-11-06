/**
 * Custom Components API
 * GET  /api/builder/custom-components?tenant=slug  — list components for tenant
 * POST /api/builder/custom-components              — create new component
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import type { CustomComponentDefinition, ComponentPropDef, ComponentEventDef } from '@/platform/custom-components/types';

const ComponentPropDefSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
});

const ComponentEventDefSchema = z.object({
  name: z.string().min(1),
  payload: z.record(z.string()),
  description: z.string().optional(),
});

const CreateComponentSchema = z.object({
  tenantSlug: z.string().min(1),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional().default(''),
  code: z.string().min(1),
  props: z.array(ComponentPropDefSchema).default([]),
  events: z.array(ComponentEventDefSchema).default([]),
});

interface DbComponentRow {
  id: string;
  tenant_slug: string;
  name: string;
  slug: string;
  description: string | null;
  code: string;
  props: ComponentPropDef[];
  events: ComponentEventDef[];
  version: number;
  created_at: Date;
  updated_at: Date;
}

function rowToComponent(row: DbComponentRow): CustomComponentDefinition {
  return {
    id: row.id,
    tenantSlug: row.tenant_slug,
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    code: row.code,
    props: row.props,
    events: row.events,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function authorizeBuilderAccess(tenantSlug: string): Promise<NextResponse | { tenantSlug: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { tenantSlug };
}

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Missing tenant parameter' }, { status: 400 });
  }

  const auth = await authorizeBuilderAccess(tenantSlug);
  if (auth instanceof NextResponse) return auth;

  const result = await pgPool.query<DbComponentRow>(
    `SELECT * FROM platform.custom_components WHERE tenant_slug = $1 ORDER BY updated_at DESC`,
    [tenantSlug]
  );

  return NextResponse.json({ components: result.rows.map(rowToComponent) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = CreateComponentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { tenantSlug, name, slug, description, code, props, events } = parsed.data;

  const auth = await authorizeBuilderAccess(tenantSlug);
  if (auth instanceof NextResponse) return auth;

  const id = uuid();
  const result = await pgPool.query<DbComponentRow>(
    `INSERT INTO platform.custom_components
       (id, tenant_slug, name, slug, description, code, props, events)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
     RETURNING *`,
    [id, tenantSlug, name, slug, description, code, JSON.stringify(props), JSON.stringify(events)]
  );

  // Store initial version
  await pgPool.query(
    `INSERT INTO platform.custom_component_versions (id, component_id, version, code)
     VALUES ($1, $2, 1, $3)`,
    [uuid(), id, code]
  );

  return NextResponse.json({ component: rowToComponent(result.rows[0]) }, { status: 201 });
}
