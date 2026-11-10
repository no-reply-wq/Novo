import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';
import type { CustomComponent, ComponentPropDef, ComponentEventDef } from '@/platform/custom-components/types';

interface CustomComponentRow {
  id: string;
  app_id: string;
  name: string;
  description: string | null;
  source_code: string;
  compiled_code: string | null;
  props_schema: ComponentPropDef[];
  events_schema: ComponentEventDef[];
  version: number;
  storage_key: string | null;
}

function rowToComponent(row: CustomComponentRow): CustomComponent {
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name,
    description: row.description ?? undefined,
    sourceCode: row.source_code,
    compiledCode: row.compiled_code ?? undefined,
    propsSchema: row.props_schema,
    eventsSchema: row.events_schema,
    version: row.version,
    storageKey: row.storage_key ?? undefined,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> },
): Promise<NextResponse> {
  const { appId, id } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const result = await pgPool.query<CustomComponentRow>(
    `SELECT id, app_id, name, description, source_code, compiled_code,
            props_schema, events_schema, version, storage_key
     FROM platform.custom_components_v2
     WHERE id = $1 AND app_id = $2`,
    [id, appId],
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ component: rowToComponent(result.rows[0]!) });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> },
): Promise<NextResponse> {
  const { appId, id } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json()) as Partial<CustomComponent>;

  const result = await pgPool.query<CustomComponentRow>(
    `UPDATE platform.custom_components_v2
     SET name = COALESCE($3, name),
         description = $4,
         source_code = COALESCE($5, source_code),
         props_schema = COALESCE($6, props_schema),
         events_schema = COALESCE($7, events_schema),
         updated_at = now()
     WHERE id = $1 AND app_id = $2
     RETURNING id, app_id, name, description, source_code, compiled_code,
               props_schema, events_schema, version, storage_key`,
    [
      id,
      appId,
      body.name ?? null,
      body.description ?? null,
      body.sourceCode ?? null,
      body.propsSchema ? JSON.stringify(body.propsSchema) : null,
      body.eventsSchema ? JSON.stringify(body.eventsSchema) : null,
    ],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ component: rowToComponent(result.rows[0]!) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> },
): Promise<NextResponse> {
  const { appId, id } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  await pgPool.query(
    `DELETE FROM platform.custom_components_v2 WHERE id = $1 AND app_id = $2`,
    [id, appId],
  );
  return NextResponse.json({ deleted: true });
}
