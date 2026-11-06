import { NextRequest, NextResponse } from 'next/server';
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
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  const result = await pgPool.query<CustomComponentRow>(
    `SELECT id, app_id, name, description, source_code, compiled_code,
            props_schema, events_schema, version, storage_key
     FROM platform.custom_components_v2
     WHERE app_id = $1
     ORDER BY name`,
    [appId],
  );
  return NextResponse.json({ components: result.rows.map(rowToComponent) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
): Promise<NextResponse> {
  const { appId } = await params;
  const body = (await req.json()) as Partial<CustomComponent>;

  if (!body.name || !body.sourceCode) {
    return NextResponse.json({ error: 'name and sourceCode are required' }, { status: 400 });
  }

  const result = await pgPool.query<CustomComponentRow>(
    `INSERT INTO platform.custom_components_v2
       (app_id, name, description, source_code, props_schema, events_schema)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, app_id, name, description, source_code, compiled_code,
               props_schema, events_schema, version, storage_key`,
    [
      appId,
      body.name,
      body.description ?? null,
      body.sourceCode,
      JSON.stringify(body.propsSchema ?? []),
      JSON.stringify(body.eventsSchema ?? []),
    ],
  );

  return NextResponse.json({ component: rowToComponent(result.rows[0]!) }, { status: 201 });
}
