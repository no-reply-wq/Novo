import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js Edge Middleware
 * Protects /api/builder/* and /(builder)/* routes — requires a valid NextAuth session.
 * Portal routes (/portal/*, /api/portal2/*) use their own cookie-based auth.
 */
export default withAuth(
  function middleware(req: NextRequest) {
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized({ token }) {
        // Allow if any valid JWT token exists
        return !!token
      },
    },
  }
)

export const config = {
  matcher: [
    // Protect all builder API routes
    '/api/builder/:path*',
    // Protect builder UI pages
    '/(builder)/:path*',
    // Protect platform admin routes
    '/api/platform/:path*',
    '/admin/:path*',
  ],
}
