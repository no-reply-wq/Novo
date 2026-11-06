import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'
import type { RESTConnector } from '@/platform/integrations/rest/types'

interface ConnRow { id: string; app_id: string; name: string; base_url: string; config: Omit<RESTConnector, 'id' | 'appId' | 'name' | 'baseUrl'> }

function rowToConnector(r: ConnRow): RESTConnector {
  return { id: r.id, appId: r.app_id, name: r.name, baseUrl: r.base_url, ...r.config }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> }
): Promise<NextResponse> {
  const { appId, id } = await params
  const r = await pgPool.query<ConnRow>(
    `SELECT id, app_id, name, base_url, config FROM platform.rest_connectors WHERE id = $1 AND app_id = $2`,
    [id, appId]
  )
  if (r.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ connector: rowToConnector(r.rows[0]!) })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> }
): Promise<NextResponse> {
  const { appId, id } = await params
  const body = (await req.json()) as Partial<RESTConnector>
  const { name, baseUrl, auth, defaultHeaders, requests } = body
  const r = await pgPool.query<ConnRow>(
    `UPDATE platform.rest_connectors
     SET name = COALESCE($3, name),
         base_url = COALESCE($4, base_url),
         config = config || $5::jsonb,
         updated_at = now()
     WHERE id = $1 AND app_id = $2
     RETURNING id, app_id, name, base_url, config`,
    [id, appId, name ?? null, baseUrl ?? null,
     JSON.stringify({ ...(auth && { auth }), ...(defaultHeaders && { defaultHeaders }), ...(requests && { requests }) })]
  )
  if (r.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ connector: rowToConnector(r.rows[0]!) })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; id: string }> }
): Promise<NextResponse> {
  const { appId, id } = await params
  await pgPool.query(`DELETE FROM platform.rest_connectors WHERE id = $1 AND app_id = $2`, [id, appId])
  return NextResponse.json({ deleted: true })
}
