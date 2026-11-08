import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getWhitelabelConfig, saveWhitelabelConfig } from '@/platform/whitelabel/service';
import type { WhitelabelConfig } from '@/platform/whitelabel/types';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantSlug = new URL(req.url).searchParams.get('tenantSlug');
    if (!tenantSlug) return NextResponse.json({ error: 'tenantSlug query param is required' }, { status: 400 });
    return NextResponse.json(await getWhitelabelConfig(tenantSlug, pgPool));
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Partial<WhitelabelConfig> & { tenantSlug?: string };
    if (!body.tenantSlug) return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 });
    const config: WhitelabelConfig = {
      tenantSlug: body.tenantSlug, customDomain: body.customDomain, logoUrl: body.logoUrl,
      faviconUrl: body.faviconUrl, primaryColor: body.primaryColor, companyName: body.companyName,
      supportEmail: body.supportEmail, hideNovoBranding: body.hideNovoBranding ?? false, customCss: body.customCss,
    };
    await saveWhitelabelConfig(config, pgPool);
    return NextResponse.json(config);
  } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
