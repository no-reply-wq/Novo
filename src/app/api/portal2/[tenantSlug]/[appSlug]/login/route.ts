import { NextRequest, NextResponse } from 'next/server'
import { portalLogin, AuthError } from '@/platform/portals/auth'

/** POST /api/portal/[tenantSlug]/[portalSlug]/login */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; appSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug, appSlug: portalSlug } = await params

  const body = await req.json() as { email?: string; password?: string }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  try {
    const result = await portalLogin({
      tenantSlug,
      portalSlug,
      email: body.email,
      password: body.password,
    })

    // Return token + user (omit password hash)
    const { passwordHash: _pw, ...safeUser } = result.user

    return NextResponse.json(
      { token: result.token, user: safeUser },
      {
        headers: {
          'Set-Cookie': `portal_token=${result.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
        },
      }
    )
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === 'PORTAL_NOT_FOUND' ? 404 : 401
      return NextResponse.json({ error: err.message }, { status })
    }
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
