import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { pgPool } from '@/lib/db/client'
import { createPortalUser } from '@/platform/portals/auth'

async function ensureTable() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS platform.portal_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      portal_id UUID NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(portal_id, email)
    )
  `)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId } = await params

  try {
    await ensureTable()

    // Get portal linked to this app
    const portalResult = await pgPool.query<{ id: string }>(
      `SELECT id FROM platform.portals WHERE app_id = $1::uuid LIMIT 1`,
      [appId]
    )
    if (portalResult.rows.length === 0) {
      return NextResponse.json({ users: [] })
    }
    const portalId = portalResult.rows[0].id

    const result = await pgPool.query(
      `SELECT id, name, email, role, last_login, created_at FROM platform.portal_users WHERE portal_id = $1 ORDER BY created_at DESC`,
      [portalId]
    )
    return NextResponse.json({ users: result.rows })
  } catch (err) {
    console.error('GET portal-users error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId } = await params

  try {
    await ensureTable()

    const body = await req.json() as { name?: string; email?: string; password?: string; role?: string }
    const { name = '', email, password, role = 'viewer' } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    // Find tenant_slug for this app
    const appResult = await pgPool.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM public.apps WHERE id = $1::uuid LIMIT 1`,
      [appId]
    )
    if (appResult.rows.length === 0) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    const tenantResult = await pgPool.query<{ slug: string }>(
      `SELECT slug FROM platform.tenants WHERE id = $1::uuid LIMIT 1`,
      [appResult.rows[0].tenant_id]
    )
    if (tenantResult.rows.length === 0) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const tenantSlug = tenantResult.rows[0].slug

    // Get portal slug for this app
    const portalResult = await pgPool.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM platform.portals WHERE app_id = $1::uuid LIMIT 1`,
      [appId]
    )
    if (portalResult.rows.length === 0) {
      return NextResponse.json({ error: 'No portal found for this app. Create a portal first.' }, { status: 400 })
    }

    const user = await createPortalUser({
      tenantSlug,
      portalId: portalResult.rows[0].id,
      name,
      email,
      password,

    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    console.error('POST portal-users error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { appId } = await params

  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    // Verify user belongs to this app's portal
    const result = await pgPool.query(
      `DELETE FROM platform.portal_users pu
       USING platform.portals p
       WHERE pu.portal_id = p.id
         AND p.app_id = $1::uuid
         AND pu.id = $2::uuid`,
      [appId, userId]
    )

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE portal-users error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
