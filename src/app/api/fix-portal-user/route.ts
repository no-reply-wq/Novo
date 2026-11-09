import { NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'
import { hashPassword, verifyPassword } from '@/platform/portals/auth'

export async function GET() {
  try {
    const password = 'Colorplas@123'
    
    const portalResult = await pgPool.query(
      `SELECT id FROM platform.portals WHERE tenant_slug = 'colorplas' AND slug = 'colorplas-erp' LIMIT 1`
    )
    
    if (portalResult.rows.length === 0) {
      const appResult = await pgPool.query(
        `SELECT id FROM public.apps WHERE slug = 'colorplas-erp' LIMIT 1`
      )
      const appId = appResult.rows[0]?.id
      await pgPool.query(
        `INSERT INTO platform.portals (tenant_slug, slug, name, type, app_id, config) VALUES ('colorplas', 'colorplas-erp', 'Colorplas ERP', 'erp', $1, '{}')`,
        [appId]
      )
    }
    
    const finalPortal = await pgPool.query(
      `SELECT id FROM platform.portals WHERE tenant_slug = 'colorplas' AND slug = 'colorplas-erp' LIMIT 1`
    )
    const portalId = finalPortal.rows[0]?.id
    const newHash = await hashPassword(password)
    const isValid = await verifyPassword(password, newHash)
    
    await pgPool.query(`DELETE FROM platform.portal_users WHERE email = 'admin@colorplas.com'`)
    
    const newUser = await pgPool.query(
      `INSERT INTO platform.portal_users (portal_id, tenant_slug, email, name, password_hash, is_active) VALUES ($1, 'colorplas', 'admin@colorplas.com', 'Colorplas Admin', $2, true) RETURNING id, email`,
      [portalId, newHash]
    )
    
    return NextResponse.json({ success: true, portalId, user: newUser.rows[0], hashValid: isValid })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
