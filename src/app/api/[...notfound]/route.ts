import { NextResponse } from 'next/server';

/**
 * Catch-all 404 for unmatched API paths.
 *
 * Without this, a two-segment unknown path like `/api/totally-fake-xyz` was
 * caught by the root-level page route `(runtime)/[tenantSlug]/[appSlug]`
 * (tenantSlug="api", appSlug="totally-fake-xyz") and rendered a 200 HTML app
 * shell instead of a real 404. The static `api` segment plus this catch-all
 * takes priority over that dynamic page route, so any `/api/*` request with no
 * matching handler now returns a proper JSON 404. Real routes (api/health,
 * api/auth, etc.) are more specific and still win over this catch-all.
 */

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
