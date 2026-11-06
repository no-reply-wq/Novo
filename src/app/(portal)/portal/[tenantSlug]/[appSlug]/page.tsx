import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifyPortalToken } from '@/platform/portals/auth'
import { pgPool } from '@/lib/db/client'

interface PortalRow {
  id: string
  config: {
    publicPages?: string[]
    loginEnabled?: boolean
  }
}

export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ tenantSlug: string; appSlug: string }>
}) {
  const { tenantSlug, appSlug } = await params

  // Look up portal config
  const portalResult = await pgPool.query<PortalRow>(
    `SELECT id, config FROM platform.portals
     WHERE tenant_slug = $1 AND slug = $2
     LIMIT 1`,
    [tenantSlug, appSlug]
  ).catch(() => ({ rows: [] as PortalRow[] }))

  if (portalResult.rows.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#6b7280' }}>
        Portal not found.
      </div>
    )
  }

  const portal = portalResult.rows[0]
  const config = portal.config
  const publicPages: string[] = config.publicPages ?? []
  const loginEnabled = config.loginEnabled !== false

  // Check if user is authenticated
  const cookieStore = await cookies()
  const token = cookieStore.get('portal_token')?.value ?? ''
  const payload = verifyPortalToken(token)
  const isAuthenticated = payload !== null && payload.tenantSlug === tenantSlug

  if (!isAuthenticated && loginEnabled && publicPages.length === 0) {
    redirect(`/portal/${tenantSlug}/${appSlug}/login`)
  }

  // Redirect to first public page or first accessible page
  if (publicPages.length > 0) {
    redirect(`/portal/${tenantSlug}/${appSlug}/p/${publicPages[0]}`)
  }

  if (!isAuthenticated) {
    redirect(`/portal/${tenantSlug}/${appSlug}/login`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif', color: '#6b7280' }}>
      Welcome to the portal. No pages configured yet.
    </div>
  )
}
