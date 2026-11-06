import { redirect, notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifyPortalToken } from '@/platform/portals/auth'
import { pgPool } from '@/lib/db/client'

interface PortalConfigRow {
  id: string
  app_id: string
  config: {
    publicPages?: string[]
    loginEnabled?: boolean
    allowedTableAccess?: Array<{
      tableId: string
      canRead: boolean
      canCreate: boolean
      canUpdate: boolean
      rowFilter?: string
    }>
  }
}

export default async function PortalPageRoute({
  params,
}: {
  params: Promise<{ tenantSlug: string; appSlug: string; pageSlug: string }>
}) {
  const { tenantSlug, portalSlug, pageSlug } = await params

  // Look up portal
  const portalResult = await pgPool.query<PortalConfigRow>(
    `SELECT id, app_id, config FROM platform.portals
     WHERE tenant_slug = $1 AND slug = $2
     LIMIT 1`,
    [tenantSlug, portalSlug]
  ).catch(() => ({ rows: [] as PortalConfigRow[] }))

  if (portalResult.rows.length === 0) {
    notFound()
  }

  const portal = portalResult.rows[0]
  const config = portal.config
  const publicPages: string[] = config.publicPages ?? []
  const loginEnabled = config.loginEnabled !== false
  const isPublicPage = publicPages.includes(pageSlug)

  // Auth check
  const cookieStore = await cookies()
  const token = cookieStore.get('portal_token')?.value ?? ''
  const payload = verifyPortalToken(token)
  const isAuthenticated = payload !== null && payload.tenantSlug === tenantSlug

  if (!isPublicPage && loginEnabled && !isAuthenticated) {
    redirect(`/portal/${tenantSlug}/${portalSlug}/login`)
  }

  return (
    <div style={{
      minHeight: '100vh',
      fontFamily: 'Inter, system-ui, sans-serif',
      background: '#f9fafb',
    }}>
      {/* Portal header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>
          {portalSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
        {isAuthenticated && (
          <form action={`/api/portal/${tenantSlug}/${portalSlug}/logout`} method="POST">
            <button type="submit" style={{
              background: 'transparent',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 13,
              color: '#6b7280',
              cursor: 'pointer',
            }}>
              Sign out
            </button>
          </form>
        )}
      </header>

      {/* Page content */}
      <main style={{ padding: 24 }}>
        <div style={{
          background: '#fff',
          borderRadius: 10,
          border: '1px solid #e5e7eb',
          padding: 24,
        }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
            {pageSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </h2>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
            Portal page — connected to app {portal.app_id}
          </p>
          {isAuthenticated && payload && (
            <div style={{ marginTop: 16, padding: 12, background: '#f0f9ff', borderRadius: 8, fontSize: 13, color: '#0369a1' }}>
              Viewing as portal user: {payload.userId}
            </div>
          )}
          {isPublicPage && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
              This is a public page — no login required.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
