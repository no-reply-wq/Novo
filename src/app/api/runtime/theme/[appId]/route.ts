import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'
import type { AppTheme } from '@/platform/theme/types'
import { DEFAULT_THEME } from '@/platform/theme/types'
import { generateThemeCss } from '@/platform/theme/css-generator'

/** GET /api/runtime/theme/[appId]?tenant=...
 *  Returns the CSS string for injection into the runtime app shell.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params
  const { searchParams } = new URL(req.url)
  const tenantSlug = searchParams.get('tenant') ?? ''

  let theme: AppTheme

  if (tenantSlug) {
    const result = await pgPool.query<{ id: string; config: Record<string, unknown>; name: string; created_at: string; updated_at: string }>(
      `SELECT id, name, config, created_at, updated_at
       FROM platform.app_themes
       WHERE app_id = $1 AND tenant_slug = $2 AND is_active = true
       LIMIT 1`,
      [appId, tenantSlug]
    ).catch(() => ({ rows: [] as { id: string; config: Record<string, unknown>; name: string; created_at: string; updated_at: string }[] }))

    if (result.rows.length > 0) {
      const row = result.rows[0]
      theme = {
        ...DEFAULT_THEME,
        ...(row.config as Partial<AppTheme>),
        id: row.id,
        name: row.name,
        appId,
        tenantSlug,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    } else {
      theme = {
        ...DEFAULT_THEME,
        id: '',
        appId,
        tenantSlug,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
  } else {
    theme = {
      ...DEFAULT_THEME,
      id: '',
      appId,
      tenantSlug: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  const css = generateThemeCss(theme)

  return new NextResponse(css, {
    headers: {
      'Content-Type': 'text/css',
      'Cache-Control': 'public, max-age=60, s-maxage=300',
    },
  })
}
