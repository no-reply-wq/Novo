/**
 * Custom Component Detail API
 * GET    /api/builder/custom-components/[componentId]  — get component
 * PATCH  /api/builder/custom-components/[componentId]  — update component
 * DELETE /api/builder/custom-components/[componentId]  — delete component
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { pgPool } from '@/lib/db/client';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import type { CustomComponentDefinition, ComponentPropDef, ComponentEventDef } from '@/platform/custom-components/types';

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

const PatchComponentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  code: z.string().min(1).optional(),
  props: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    required: z.boolean(),
    defaultValue: z.unknown().optional(),
    description: z.string().optional(),
  })).optional(),
  events: z.array(z.object({
    name: z.string().min(1),
    payloadSchema: z.array(z.unknown()).optional(),
    description: z.string().optional(),
  })).optional(),
});

async function getComponentWithAuth(componentId: string): Promise<{ component: DbComponentRow } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await pgPool.query<DbComponentRow>(
    `SELECT * FROM platform.custom_components WHERE id = $1`,
    [componentId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Component not found' }, { status: 404 });
  }

  const component = result.rows[0];

  if (!session.user.isPlatformAdmin && session.user.tenantSlug !== component.tenant_slug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { component };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ componentId: string }> }
) {
  const { componentId } = await params;
  const authResult = await getComponentWithAuth(componentId);
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({ component: rowToComponent(authResult.component) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ componentId: string }> }
) {
  const { componentId } = await params;
  const authResult = await getComponentWithAuth(componentId);
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json().catch(() => ({})) as unknown;
  const parsed = PatchComponentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { name, description, code, props, events } = parsed.data;
  const current = authResult.component;

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIdx++}`);
    values.push(name);
  }
  if (description !== undefined) {
    updates.push(`description = $${paramIdx++}`);
    values.push(description);
  }
  if (code !== undefined) {
    updates.push(`code = $${paramIdx++}`);
    values.push(code);
    updates.push(`version = version + 1`);
  }
  if (props !== undefined) {
    updates.push(`props = $${paramIdx++}::jsonb`);
    values.push(JSON.stringify(props));
  }
  if (events !== undefined) {
    updates.push(`events = $${paramIdx++}::jsonb`);
    values.push(JSON.stringify(events));
  }

  if (updates.length === 0) {
    return NextResponse.json({ component: rowToComponent(current) });
  }

  updates.push(`updated_at = now()`);
  values.push(componentId);

  const result = await pgPool.query<DbComponentRow>(
    `UPDATE platform.custom_components SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );

  // If code changed, record the version
  if (code !== undefined) {
    await pgPool.query(
      `INSERT INTO platform.custom_component_versions (id, component_id, version, code)
       VALUES ($1, $2, $3, $4)`,
      [uuid(), componentId, result.rows[0].version, code]
    );
  }

  return NextResponse.json({ component: rowToComponent(result.rows[0]) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ componentId: string }> }
) {
  const { componentId } = await params;
  const authResult = await getComponentWithAuth(componentId);
  if (authResult instanceof NextResponse) return authResult;

  await pgPool.query(
    `DELETE FROM platform.custom_components WHERE id = $1`,
    [componentId]
  );

  return NextResponse.json({ deleted: true });
}
