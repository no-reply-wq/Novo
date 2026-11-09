import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken } from '@/platform/portals/auth'
import { pgPool } from '@/lib/db/client'

/**
 * GET /api/portal2/[tenantSlug]/[appSlug]/pages/[pageSlug]
 * Returns one page definition (id, name, slug, layout[]).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; appSlug: string; pageSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug, appSlug, pageSlug } = await params

  const authHeader = req.headers.get('authorization') ?? ''
  const cookieToken = req.cookies.get('portal_token')?.value ?? ''
  const token = authHeader.replace(/^Bearer /, '') || cookieToken
  const payload = token ? verifyPortalToken(token) : null
  if (token && (!payload || payload.tenantSlug !== tenantSlug)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const schema = `tenant_${tenantSlug}`

  try {
    const portalResult = await pgPool.query<{ id: string; app_id: string }>(
      `SELECT id, app_id FROM platform.portals WHERE tenant_slug = $1 AND slug = $2 LIMIT 1`,
      [tenantSlug, appSlug]
    )
    const appId: string | null = portalResult.rows[0]?.app_id ?? null

    // Try platform.app_pages first
    if (appId) {
      try {
        const rows = await pgPool.query<{ id: string; name: string; slug: string; canvas_definition: unknown }>(
          `SELECT id, name, slug, canvas_definition FROM platform.app_pages WHERE app_id = $1::uuid AND slug = $2 LIMIT 1`,
          [appId, pageSlug]
        )
        if (rows.rows.length > 0) {
          const r = rows.rows[0]
          const def = (r.canvas_definition ?? {}) as { components?: unknown[]; layout?: unknown[] }
          const layout = def.components ?? def.layout ?? []
          return NextResponse.json({ id: r.id, name: r.name, slug: r.slug, layout })
        }
      } catch {
        // fall through
      }
    }

    // Fall back to tenant schema _pages
    try {
      const whereClause = appId
        ? `WHERE app_id = $1 AND slug = $2 LIMIT 1`
        : `WHERE slug = $1 LIMIT 1`
      const queryParams = appId ? [appId, pageSlug] : [pageSlug]
      const pagesResult = await pgPool.query<{ id: string; name: string; slug: string; layout: unknown }>(
        `SELECT id, name, slug, layout FROM ${schema}._pages ${whereClause}`,
        queryParams
      )
      if (pagesResult.rows.length === 0) {
        return NextResponse.json({ error: 'Page not found' }, { status: 404 })
      }
      const r = pagesResult.rows[0]
      return NextResponse.json({
        id: r.id, name: r.name, slug: r.slug,
        layout: Array.isArray(r.layout) ? r.layout : [],
      })
    } catch {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }
  } catch (err) {
    console.error('GET /portal2/pages/[pageSlug] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
