import { NextRequest, NextResponse } from 'next/server'
import { requireBuilderApp } from '@/lib/auth/tenant-session'
import { pgPool } from '@/lib/db/client'
import { createPortalUser } from '@/platform/portals/auth'

/**
 * Portal users for an app's customer portal.
 *
 * Auth + app-ownership is enforced by requireBuilderApp. The portal_users table
 * is owned by migrations 014/016 (columns: id, portal_id, tenant_slug, email,
 * name, password_hash, metadata, is_active, created_at, last_login_at) — this
 * route must match that schema and must NOT recreate the table with a different
 * shape. apps.id and portals.app_id are text/uuid across environments, so joins
 * compare on ::text.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams)
  if (ctx instanceof NextResponse) return ctx

  try {
    const portalResult = await pgPool.query<{ id: string }>(
      `SELECT id FROM platform.portals WHERE app_id::text = $1 LIMIT 1`,
      [appId]
    )
    if (portalResult.rows.length === 0) {
      return NextResponse.json({ users: [] })
    }
    const result = await pgPool.query(
      `SELECT id, name, email, is_active, created_at, last_login_at
       FROM platform.portal_users WHERE portal_id = $1 ORDER BY created_at DESC`,
      [portalResult.rows[0].id]
    )
    return NextResponse.json({ users: result.rows })
  } catch (err) {
    console.error('GET portal-users error:', err)
    return NextResponse.json({ error: 'Could not load portal users' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await req.json() as { name?: string; email?: string; password?: string }
    const { name = '', email, password } = body
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // The app's tenant comes straight off public.apps (text column, text id).
    const appResult = await pgPool.query<{ tenant_slug: string }>(
      `SELECT tenant_slug FROM public.apps WHERE id::text = $1 LIMIT 1`,
      [appId]
    )
    if (appResult.rows.length === 0) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }
    const tenantSlug = appResult.rows[0].tenant_slug

    const portalResult = await pgPool.query<{ id: string }>(
      `SELECT id FROM platform.portals WHERE app_id::text = $1 LIMIT 1`,
      [appId]
    )
    if (portalResult.rows.length === 0) {
      return NextResponse.json({ error: 'No portal exists for this app yet. Create a portal first.' }, { status: 400 })
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
    const msg = err instanceof Error ? err.message : 'Could not create portal user'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams)
  if (ctx instanceof NextResponse) return ctx

  try {
    const userId = new URL(req.url).searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const result = await pgPool.query(
      `DELETE FROM platform.portal_users pu
       USING platform.portals p
       WHERE pu.portal_id = p.id
         AND p.app_id::text = $1
         AND pu.id::text = $2`,
      [appId, userId]
    )
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE portal-users error:', err)
    return NextResponse.json({ error: 'Could not remove portal user' }, { status: 500 })
  }
}
