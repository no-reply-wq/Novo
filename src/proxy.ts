import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { resolveTenantFromHost } from '@/lib/tenant/resolver';

// Next.js 16 renamed middleware.ts -> proxy.ts. Genuinely convenient here:
// proxy always runs on the Node.js runtime (no longer configurable, and
// no longer Edge-by-default), which is exactly what resolveTenantFromHost
// needs since it queries Postgres directly via Prisma — this used to
// require an explicit `runtime: 'nodejs'` override; that's no longer a
// thing to set, it's just how proxy works now.
export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};

const PUBLIC_PATHS = ['/login', '/api/auth', '/_next', '/favicon.ico', '/suspended'];
const PLATFORM_ADMIN_PATHS = ['/admin/platform'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') ?? '';

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── Resolve tenant by HOSTNAME first ──────────────────────────────
  // This is what makes custom domains actually work: a request to
  // erp.jeevaka.com needs to resolve to the Jeevaka tenant and be
  // internally rewritten to /jeevaka/... , the same URL structure the
  // rest of the app already expects. Platform-admin paths and the
  // platform's own base domain skip this — there's no "tenant" to
  // resolve for those.
  const isPlatformAdminPath = PLATFORM_ADMIN_PATHS.some((p) => pathname.startsWith(p));
  const baseDomain = process.env.BASE_DOMAIN ?? 'lrbc-erp.com';
  const hostname = host.split(':')[0].toLowerCase();
  // Covers plain localhost, 127.0.0.1, *.localhost, AND private LAN IPs
  // (192.168.x.x, 10.x.x.x, 172.16-31.x.x) — Next.js's own dev server
  // prints a "Network" URL using your machine's LAN IP specifically so
  // you can test from another device, and that's exactly as much "not a
  // real tenant domain" as localhost is.
  const isLocalDev =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost') ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
  const isOnPlatformBaseDomain = hostname === baseDomain || hostname === `www.${baseDomain}` || isLocalDev;

  if (!isPlatformAdminPath && !isOnPlatformBaseDomain && hostname) {
    const tenant = await resolveTenantFromHost(hostname);

    if (!tenant) {
      // Hostname doesn't match any tenant's custom domain or subdomain —
      // most likely a domain that was pointed here but never verified.
      // An inline response rather than a redirect to a hardcoded external
      // URL, so this behaves correctly in local/staging environments too.
      // charset=utf-8 declared explicitly — omitting it let the browser
      // guess the encoding and mangle the curly quotes below into â€™.
      return new NextResponse(
        '<html><body style="font-family:sans-serif;text-align:center;padding-top:80px;color:#475569;">' +
        '<h2>This domain isn\u2019t connected to an ERP yet</h2>' +
        '<p>If you\u2019re the site owner, check the domain settings in your admin panel.</p>' +
        '</body></html>',
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    if (tenant.status === 'SUSPENDED') {
      // A clear, dedicated page instead of a silently broken/empty app —
      // this is the gap the original build left: suspension was checked
      // at login and at the data-API layer, but someone already logged
      // in when their tenant got suspended would just see empty pages
      // with no explanation. Checking here, before any page renders,
      // closes that gap.
      return NextResponse.redirect(new URL('/suspended', req.url));
    }

    // Only rewrite when this request came in on a domain OTHER than the
    // path already implies (i.e. a custom domain, where there's no
    // /tenantSlug/ prefix in the URL at all) — internally serve it as
    // if it were requested at /tenantSlug/... so nothing else in the
    // app needs to know or care whether a custom domain was used.
    const alreadyHasTenantPrefix = pathname.startsWith(`/${tenant.slug}/`) || pathname === `/${tenant.slug}`;
    if (!alreadyHasTenantPrefix && pathname !== '/login') {
      const rewritten = req.nextUrl.clone();
      rewritten.pathname = `/${tenant.slug}${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(rewritten);
    }
  }

  // ── Auth checks (unchanged from before, on top of tenant resolution) ──
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (isPlatformAdminPath) {
    if (!token?.isPlatformAdmin) {
      return NextResponse.redirect(new URL('/login?mode=admin', req.url));
    }
    return NextResponse.next();
  }

  const tenantRouteMatch = pathname.match(/^\/([a-z0-9-]+)\/.+/);
  if (tenantRouteMatch) {
    const tenantSlug = tenantRouteMatch[1];
    if (['login', 'api', 'admin', '_next'].includes(tenantSlug)) {
      return NextResponse.next();
    }
    if (!token) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('tenant', tenantSlug);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (token.isPlatformAdmin) return NextResponse.next();
    if (token.tenantSlug !== tenantSlug) {
      return NextResponse.redirect(new URL(`/${token.tenantSlug}/dashboard`, req.url));
    }
  }

  return NextResponse.next();
}
