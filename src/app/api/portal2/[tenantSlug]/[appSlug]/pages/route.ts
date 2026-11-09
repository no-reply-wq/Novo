import { NextRequest, NextResponse } from 'next/server'
import { verifyPortalToken } from '@/platform/portals/auth'
import { pgPool } from '@/lib/db/client'

/**
 * GET /api/portal2/[tenantSlug]/[appSlug]/pages
 * Returns the list of pages for this portal's app.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; appSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug, appSlug } = await params

  const authHeader = req.headers.get('authorization') ?? ''
  const cookieToken = req.cookies.get('portal_token')?.value ?? ''
  const token = authHeader.replace(/^Bearer /, '') || cookieToken
  const payload = token ? verifyPortalToken(token) : null
  if (token && (!payload || payload.tenantSlug !== tenantSlug)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const schema = `tenant_${tenantSlug}`

  try {
    // Look up portal to get app_id
    const portalResult = await pgPool.query<{ id: string; app_id: string }>(
      `SELECT id, app_id FROM platform.portals WHERE tenant_slug = $1 AND slug = $2 LIMIT 1`,
      [tenantSlug, appSlug]
    )
    const appId: string | null = portalResult.rows[0]?.app_id ?? null

    // Try platform.app_pages first (new canvas builder)
    if (appId) {
      try {
        const newPages = await pgPool.query<{
          id: string; name: string; slug: string; canvas_definition: unknown
        }>(
          `SELECT id, name, slug, canvas_definition FROM platform.app_pages WHERE app_id = $1::uuid ORDER BY created_at ASC`,
          [appId]
        )
        if (newPages.rows.length > 0) {
          const pages = newPages.rows.map(r => {
            const def = (r.canvas_definition ?? {}) as { components?: unknown[]; layout?: unknown[] }
            const layout = def.components ?? def.layout ?? []
            return { id: r.id, name: r.name, slug: r.slug, layout }
          })
          return NextResponse.json({ pages })
        }
      } catch {
        // platform.app_pages may not exist — fall through
      }
    }

    // Fall back to tenant schema _pages table (old builder)
    try {
      await pgPool.query(
        `CREATE TABLE IF NOT EXISTS ${schema}._pages (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          app_id TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          layout JSONB DEFAULT '[]'::jsonb,
          rank INT DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )`
      )
      const whereClause = appId
        ? `WHERE app_id = $1 ORDER BY rank ASC, created_at ASC`
        : `ORDER BY rank ASC, created_at ASC`
      const queryParams = appId ? [appId] : []
      const pagesResult = await pgPool.query<{ id: string; name: string; slug: string; layout: unknown }>(
        `SELECT id, name, slug, layout FROM ${schema}._pages ${whereClause}`,
        queryParams
      )
      const pages = pagesResult.rows.map(r => ({
        id: r.id, name: r.name, slug: r.slug,
        layout: Array.isArray(r.layout) ? r.layout : [],
      }))
      return NextResponse.json({ pages })
    } catch {
      return NextResponse.json({ pages: [] })
    }
  } catch (err) {
    console.error('GET /portal2/pages error:', err)
    return NextResponse.json({ pages: [] })
  }
}
