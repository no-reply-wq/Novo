import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken } from '@/platform/portals/auth'
import { pgPool } from '@/lib/db/client'
import { dispatchTrigger } from '@/platform/workflow/trigger-router'

// Allowed tables for the ERP portal - whitelist for security
const ALLOWED_TABLES = [
  'customers', 'sales_orders', 'quotations',
  'inventory_items', 'stock_movements',
  'bom', 'production_orders', 'production_logs',
  'purchase_orders', 'suppliers',
  'dispatch_orders', 'vehicles',
  'vehicle_logs', 'expenses', 'employees', 'leads'
]

function getAppId(tenantSlug: string, appSlug: string): string {
  // Derive a stable app key from tenant+app slugs
  return `${tenantSlug}__${appSlug}`
}

function authRequest(req: NextRequest, tenantSlug: string) {
  const authHeader = req.headers.get('authorization') ?? ''
  const cookieToken = req.cookies.get('portal_token')?.value ?? ''
  const token = authHeader.replace(/^Bearer /, '') || cookieToken
  if (!token) return null
  const payload = verifyPortalToken(token)
  if (!payload || payload.tenantSlug !== tenantSlug) return null
  return payload
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; appSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug } = await params
  const { searchParams } = new URL(req.url)
  const table = searchParams.get('table')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

  const payload = authRequest(req, tenantSlug)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!table || !ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const schema = `tenant_${tenantSlug}`
  try {
    const result = await pgPool.query(
      `SELECT * FROM ${schema}.${table} ORDER BY created_at DESC LIMIT $1`,
      [limit]
    )
    return NextResponse.json({ rows: result.rows, count: result.rowCount })
  } catch {
    return NextResponse.json({ rows: [], count: 0 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; appSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug, appSlug } = await params
  const payload = authRequest(req, tenantSlug)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Record<string, unknown>
  const table = body.table as string | undefined
  if (!table || !ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }

  const data = body.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const schema = `tenant_${tenantSlug}`
  const cols = Object.keys(data)
  const vals = Object.values(data)
  const colsSql = cols.map((c) => `"${c}"`).join(', ')
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')

  const result = await pgPool.query(
    `INSERT INTO ${schema}.${table} (${colsSql}) VALUES (${placeholders}) RETURNING *`,
    vals
  )
  const record = result.rows[0] as Record<string, unknown>

  // Fire workflow trigger (non-blocking)
  dispatchTrigger(
    { type: 'record_created', appId: getAppId(tenantSlug, appSlug), tenantSlug, tableApiKey: table, record },
    pgPool
  ).catch((err: unknown) => {
    console.error('[workflow] trigger error on record_created:', err)
  })

  return NextResponse.json({ record }, { status: 201 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; appSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug, appSlug } = await params
  const payload = authRequest(req, tenantSlug)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Record<string, unknown>
  const table = body.table as string | undefined
  const id = body.id as string | undefined
  if (!table || !ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const data = body.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const schema = `tenant_${tenantSlug}`
  const cols = Object.keys(data)
  const vals = Object.values(data)
  const setSql = cols.map((c, i) => `"${c}" = $${i + 2}`).join(', ')

  const result = await pgPool.query(
    `UPDATE ${schema}.${table} SET ${setSql}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...vals]
  )
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const record = result.rows[0] as Record<string, unknown>

  // Fire workflow trigger (non-blocking)
  dispatchTrigger(
    {
      type: 'record_updated',
      appId: getAppId(tenantSlug, appSlug),
      tenantSlug,
      tableApiKey: table,
      record,
      fieldApiKey: cols[0],
    },
    pgPool
  ).catch((err: unknown) => {
    console.error('[workflow] trigger error on record_updated:', err)
  })

  return NextResponse.json({ record })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; appSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug, appSlug } = await params
  const payload = authRequest(req, tenantSlug)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Record<string, unknown>
  const table = body.table as string | undefined
  const id = body.id as string | undefined
  if (!table || !ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const schema = `tenant_${tenantSlug}`
  const result = await pgPool.query(
    `DELETE FROM ${schema}.${table} WHERE id = $1 RETURNING id`,
    [id]
  )
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Fire workflow trigger (non-blocking)
  dispatchTrigger(
    {
      type: 'record_deleted',
      appId: getAppId(tenantSlug, appSlug),
      tenantSlug,
      tableApiKey: table,
      record: { id },
    },
    pgPool
  ).catch((err: unknown) => {
    console.error('[workflow] trigger error on record_deleted:', err)
  })

  return NextResponse.json({ ok: true })
}
