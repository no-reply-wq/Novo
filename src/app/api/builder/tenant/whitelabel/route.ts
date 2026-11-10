import { NextRequest, NextResponse } from 'next/server';
import { requireSessionTenant } from '@/lib/auth/tenant-session';
import { pgPool } from '@/lib/db/client';
import { getWhitelabelConfig, saveWhitelabelConfig } from '@/platform/whitelabel/service';
import type { WhitelabelConfig } from '@/platform/whitelabel/types';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await requireSessionTenant();
    if (ctx instanceof NextResponse) return ctx;
    const tenantSlug = ctx.tenant.slug;
    return NextResponse.json(await getWhitelabelConfig(tenantSlug, pgPool));
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await requireSessionTenant();
    if (ctx instanceof NextResponse) return ctx;
    const body = (await req.json()) as Partial<WhitelabelConfig>;
    const tenantSlug = ctx.tenant.slug;
    const config: WhitelabelConfig = {
      tenantSlug, customDomain: body.customDomain, logoUrl: body.logoUrl,
      faviconUrl: body.faviconUrl, primaryColor: body.primaryColor, companyName: body.companyName,
      supportEmail: body.supportEmail, hideNovoBranding: body.hideNovoBranding ?? false, customCss: body.customCss,
    };
    await saveWhitelabelConfig(config, pgPool);
    return NextResponse.json(config);
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
