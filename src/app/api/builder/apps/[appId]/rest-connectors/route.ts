import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'
import type { RESTConnector } from '@/platform/integrations/rest/types'

interface ConnRow { id: string; app_id: string; name: string; base_url: string; config: Omit<RESTConnector, 'id' | 'appId' | 'name' | 'baseUrl'> }

function rowToConnector(r: ConnRow): RESTConnector {
  return { id: r.id, appId: r.app_id, name: r.name, baseUrl: r.base_url, ...r.config }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params
  const r = await pgPool.query<ConnRow>(
    `SELECT id, app_id, name, base_url, config FROM platform.rest_connectors WHERE app_id = $1 ORDER BY updated_at DESC`,
    [appId]
  )
  return NextResponse.json({ connectors: r.rows.map(rowToConnector) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params
  const body = (await req.json()) as Partial<RESTConnector>
  if (!body.name || !body.baseUrl) {
    return NextResponse.json({ error: 'name and baseUrl required' }, { status: 422 })
  }
  const { name, baseUrl, auth = { type: 'none' }, defaultHeaders, requests = [] } = body
  const config = { auth, defaultHeaders, requests }
  const r = await pgPool.query<ConnRow>(
    `INSERT INTO platform.rest_connectors (app_id, name, base_url, config)
     VALUES ($1, $2, $3, $4) RETURNING id, app_id, name, base_url, config`,
    [appId, name, baseUrl, JSON.stringify(config)]
  )
  return NextResponse.json({ connector: rowToConnector(r.rows[0]!) }, { status: 201 })
}
