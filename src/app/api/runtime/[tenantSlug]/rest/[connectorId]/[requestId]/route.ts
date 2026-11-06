import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'
import { RESTClient } from '@/platform/integrations/rest/client'
import type { RESTConnector } from '@/platform/integrations/rest/types'

interface ConnRow {
  id: string; app_id: string; name: string; base_url: string
  config: Omit<RESTConnector, 'id' | 'appId' | 'name' | 'baseUrl'>
}

async function secretsGetter(key: string): Promise<string> {
  const envVal = process.env[key]
  if (envVal) return envVal
  const r = await pgPool.query<{ value: string }>(
    `SELECT value FROM platform.secrets WHERE key = $1 LIMIT 1`,
    [key]
  )
  if (r.rows.length > 0) return r.rows[0]!.value
  throw new Error(`Secret not found: ${key}`)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; connectorId: string; requestId: string }> }
): Promise<NextResponse> {
  const { tenantSlug, connectorId, requestId } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const r = await pgPool.query<ConnRow>(
    `SELECT rc.id, rc.app_id, rc.name, rc.base_url, rc.config
     FROM platform.rest_connectors rc
     JOIN platform.apps a ON a.id = rc.app_id
     WHERE rc.id = $1 AND a.tenant_slug = $2`,
    [connectorId, tenantSlug]
  )

  if (r.rows.length === 0) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
  }

  const row = r.rows[0]!
  const connector: RESTConnector = { id: row.id, appId: row.app_id, name: row.name, baseUrl: row.base_url, ...row.config }

  try {
    const client = new RESTClient(connector, secretsGetter)
    const result = await client.execute(requestId, body)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Error && err.name === 'SsrfBlockedError') {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    if (err instanceof Error && err.name === 'RequestNotFoundError') {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    throw err
  }
}
