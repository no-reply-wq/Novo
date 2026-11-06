import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken } from '@/platform/portals/auth'
import { pgPool } from '@/lib/db/client'

/** GET /api/portal/[tenantSlug]/[portalSlug]/me */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; appSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug } = await params

  const authHeader = req.headers.get('authorization') ?? ''
  const cookieHeader = req.cookies.get('portal_token')?.value ?? ''
  const token = authHeader.replace(/^Bearer /, '') || cookieHeader

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = verifyPortalToken(token)
  if (!payload || payload.tenantSlug !== tenantSlug) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await pgPool.query<{
    id: string
    portal_id: string
    tenant_slug: string
    email: string
    name: string
    metadata: Record<string, unknown>
    is_active: boolean
    created_at: string
    last_login_at: string | null
  }>(
    `SELECT id, portal_id, tenant_slug, email, name, metadata, is_active, created_at, last_login_at
     FROM platform.portal_users
     WHERE id = $1 AND is_active = true
     LIMIT 1`,
    [payload.userId]
  )

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const row = result.rows[0]
  return NextResponse.json({
    user: {
      id: row.id,
      portalId: row.portal_id,
      tenantSlug: row.tenant_slug,
      email: row.email,
      name: row.name,
      metadata: row.metadata,
      isActive: row.is_active,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    },
  })
}
