import { NextRequest, NextResponse } from 'next/server'
import { portalLogin } from '@/platform/portals/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; appSlug: string }> }
): Promise<NextResponse> {
  const { tenantSlug, appSlug } = await params

  try {
    const body = await req.json() as { email?: string; password?: string }
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const result = await portalLogin({ tenantSlug, portalSlug: appSlug, email, password })

    const response = NextResponse.json({ success: true, user: result.user })
    response.cookies.set('portal_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    return response
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Login failed'
    return NextResponse.json({ error: msg }, { status: 401 })
  }
}
