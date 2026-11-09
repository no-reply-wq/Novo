import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';
import type { CustomComponent, ComponentPropDef, ComponentEventDef } from '@/platform/custom-components/types';
interface CCRow { id: string; app_id: string; name: string; description: string | null; source_code: string; compiled_code: string | null; props_schema: ComponentPropDef[]; events_schema: ComponentEventDef[]; version: number; storage_key: string | null; }
function rowToCC(r: CCRow): CustomComponent { return { id: r.id, appId: r.app_id, name: r.name, description: r.description ?? undefined, sourceCode: r.source_code, compiledCode: r.compiled_code ?? undefined, propsSchema: r.props_schema, eventsSchema: r.events_schema, version: r.version, storageKey: r.storage_key ?? undefined }; }
export async function GET(req: NextRequest, { params }: { params: Promise<{ appId: string }> }): Promise<NextResponse> {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const r = await pgPool.query<CCRow>(`SELECT id, app_id, name, description, source_code, compiled_code, props_schema, events_schema, version, storage_key FROM platform.custom_components_v2 WHERE app_id = $1 ORDER BY name`, [appId]);
  return NextResponse.json({ components: r.rows.map(rowToCC) });
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ appId: string }> }): Promise<NextResponse> {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json()) as Partial<CustomComponent>;
  if (!body.name || !body.sourceCode) return NextResponse.json({ error: 'name and sourceCode are required' }, { status: 400 });
  const r = await pgPool.query<CCRow>(`INSERT INTO platform.custom_components_v2 (app_id, name, description, source_code, props_schema, events_schema) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, app_id, name, description, source_code, compiled_code, props_schema, events_schema, version, storage_key`, [appId, body.name, body.description ?? null, body.sourceCode, JSON.stringify(body.propsSchema ?? []), JSON.stringify(body.eventsSchema ?? [])]);
  return NextResponse.json({ component: rowToCC(r.rows[0]!) }, { status: 201 });
}
