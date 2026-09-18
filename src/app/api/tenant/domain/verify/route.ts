import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { prisma } from '@/lib/db/client';
import { invalidateTenantCache } from '@/lib/tenant/resolver';
import dns from 'dns/promises';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantSlug = searchParams.get('tenant');
  if (!tenantSlug) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 });

  const ctx = await requirePermission(tenantSlug, 'settings', 'manage_users');
  if (ctx instanceof NextResponse) return ctx;

  const tenant = await prisma.tenant.findFirst({
    where: { slug: tenantSlug },
    select: { customDomain: true },
  });

  if (!tenant?.customDomain) {
    return NextResponse.json({ error: 'No custom domain configured' }, { status: 400 });
  }

  const expectedToken = `lrbc-verify=${tenantSlug}`;
  let verified = false;

  try {
    // Look up TXT records on the root domain
    const rootDomain = tenant.customDomain.split('.').slice(-2).join('.');
    const txtRecords = await dns.resolveTxt(rootDomain);

    // TXT records are arrays of strings — flatten and check
    const allValues = txtRecords.flat();
    verified = allValues.some(v => v === expectedToken);

    if (!verified) {
      // Also try the full domain in case they put it there
      try {
        const fullTxt = await dns.resolveTxt(tenant.customDomain);
        verified = fullTxt.flat().some(v => v === expectedToken);
      } catch {
        // Ignore
      }
    }
  } catch (err) {
    // DNS lookup failed (NXDOMAIN etc.) — not verified
    verified = false;
  }

  if (verified) {
    await prisma.tenant.update({
      where: { slug: tenantSlug },
      data: { domainVerified: true },
    });
    invalidateTenantCache(tenantSlug);
  }

  return NextResponse.json({ verified });
}
