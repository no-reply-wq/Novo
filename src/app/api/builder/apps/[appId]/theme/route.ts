import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/tenant-session'
import { MODULE } from '@/lib/auth/modules'
import { pgPool } from '@/lib/db/client'
import type { AppTheme } from '@/platform/theme/types'
import { DEFAULT_THEME } from '@/platform/theme/types'

/** GET /api/builder/apps/[appId]/theme?tenant=... */
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

  const result = await pgPool.query<{ id: string; config: Record<string, unknown>; name: string; created_at: string; updated_at: string }>(
    `SELECT id, name, config, created_at, updated_at
     FROM platform.app_themes
     WHERE app_id = $1 AND tenant_slug = $2 AND is_active = true
     LIMIT 1`,
    [appId, tenantSlug]
  )

  if (result.rows.length === 0) {
    // Return default theme
    const defaults: Omit<AppTheme, 'id' | 'createdAt' | 'updatedAt'> = {
      ...DEFAULT_THEME,
      appId,
      tenantSlug,
    }
    return NextResponse.json({ theme: defaults })
  }

  const row = result.rows[0]
  const theme: AppTheme = {
    ...DEFAULT_THEME,
    ...(row.config as Partial<AppTheme>),
    id: row.id,
    name: row.name,
    appId,
    tenantSlug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return NextResponse.json({ theme })
}

/** PUT /api/builder/apps/[appId]/theme?tenant=... */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
): Promise<NextResponse> {
  const { appId } = await params
  const { searchParams } = new URL(req.url)
  const tenantSlug = searchParams.get('tenant')
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })

  const ctx = await requirePermission(tenantSlug, MODULE.TABLES, 'edit')
  if (ctx instanceof NextResponse) return ctx

  const body = await req.json() as Partial<AppTheme>
  const { id: _id, appId: _appId, tenantSlug: _tenantSlug, createdAt: _createdAt, updatedAt: _updatedAt, ...config } = body

  const result = await pgPool.query<{ id: string; created_at: string; updated_at: string }>(
    `INSERT INTO platform.app_themes (app_id, tenant_slug, name, config)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (app_id, tenant_slug)
     DO UPDATE SET
       name = EXCLUDED.name,
       config = EXCLUDED.config,
       updated_at = now()
     RETURNING id, created_at, updated_at`,
    [appId, tenantSlug, config.name ?? 'Default', JSON.stringify(config)]
  )

  const row = result.rows[0]
  const theme: AppTheme = {
    ...DEFAULT_THEME,
    ...config,
    id: row.id,
    appId,
    tenantSlug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return NextResponse.json({ theme })
}
