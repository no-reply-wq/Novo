import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/tenant-session'
import { MODULE } from '@/lib/auth/modules'
import { pgPool } from '@/lib/db/client'

/** GET /api/builder/apps/[appId]/portals?tenant=... */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params
  const { searchParams } = new URL(req.url)
  const tenantSlug = searchParams.get('tenant')
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'view')
  if (ctx instanceof NextResponse) return ctx

  const result = await pgPool.query<{
    id: string
    name: string
    slug: string
    type: string
    config: Record<string, unknown>
    created_at: string
  }>(
    `SELECT id, name, slug, type, config, created_at
     FROM platform.portals
     WHERE app_id = $1 AND tenant_slug = $2
     ORDER BY created_at ASC`,
    [appId, tenantSlug]
  )

  return NextResponse.json({ portals: result.rows })
}

/** POST /api/builder/apps/[appId]/portals?tenant=... */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params
  const { searchParams } = new URL(req.url)
  const tenantSlug = searchParams.get('tenant')
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'edit')
  if (ctx instanceof NextResponse) return ctx

  const body = await req.json() as {
    name?: string
    slug?: string
    type?: string
    config?: Record<string, unknown>
  }

  if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!body.slug?.trim()) return NextResponse.json({ error: 'Slug is required' }, { status: 400 })

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' }, { status: 400 })
  }

  try {
    const result = await pgPool.query<{ id: string; created_at: string }>(
      `INSERT INTO platform.portals (app_id, tenant_slug, name, slug, type, config)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        appId,
        tenantSlug,
        body.name.trim(),
        body.slug.trim(),
        body.type ?? 'customer',
        JSON.stringify(body.config ?? {}),
      ]
    )

    const row = result.rows[0]
    return NextResponse.json({
      portal: {
        id: row.id,
        appId,
        tenantSlug,
        name: body.name.trim(),
        slug: body.slug.trim(),
        type: body.type ?? 'customer',
        config: body.config ?? {},
        createdAt: row.created_at,
      },
    }, { status: 201 })
  } catch (err) {
    const dbErr = err as { code?: string }
    if (dbErr.code === '23505') {
      return NextResponse.json({ error: 'A portal with this slug already exists' }, { status: 409 })
    }
    throw err
  }
}
