import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'
import type { CustomComponent, ComponentPropDef, ComponentEventDef } from '@/platform/custom-components/types'

interface CCRow {
  id: string; app_id: string; name: string; description: string | null
  source_code: string; compiled_code: string | null
  props_schema: ComponentPropDef[]; events_schema: ComponentEventDef[]
  version: number; storage_key: string | null
}

function rowToCC(r: CCRow): CustomComponent {
  return {
    id: r.id, appId: r.app_id, name: r.name, description: r.description ?? undefined,
    sourceCode: r.source_code, compiledCode: r.compiled_code ?? undefined,
    propsSchema: r.props_schema, eventsSchema: r.events_schema,
    version: r.version, storageKey: r.storage_key ?? undefined,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> }
): Promise<NextResponse> {
  const { appId, id } = await params
  const r = await pgPool.query<CCRow>(
    `SELECT id, app_id, name, description, source_code, compiled_code, props_schema, events_schema, version, storage_key
     FROM platform.custom_components_v2 WHERE id = $1 AND app_id = $2`,
    [id, appId]
  )
  if (r.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ component: rowToCC(r.rows[0]!) })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> }
): Promise<NextResponse> {
  const { appId, id } = await params
  const body = (await req.json()) as Partial<CustomComponent>
  const r = await pgPool.query<CCRow>(
    `UPDATE platform.custom_components_v2
     SET name = COALESCE($3, name),
         description = $4,
         source_code = COALESCE($5, source_code),
         props_schema = COALESCE($6, props_schema),
         events_schema = COALESCE($7, events_schema),
         updated_at = now()
     WHERE id = $1 AND app_id = $2
     RETURNING id, app_id, name, description, source_code, compiled_code, props_schema, events_schema, version, storage_key`,
    [id, appId, body.name ?? null, body.description ?? null, body.sourceCode ?? null,
     body.propsSchema ? JSON.stringify(body.propsSchema) : null,
     body.eventsSchema ? JSON.stringify(body.eventsSchema) : null]
  )
  if (r.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ component: rowToCC(r.rows[0]!) })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> }
): Promise<NextResponse> {
  const { appId, id } = await params
  await pgPool.query(`DELETE FROM platform.custom_components_v2 WHERE id = $1 AND app_id = $2`, [id, appId])
  return NextResponse.json({ deleted: true })
}
