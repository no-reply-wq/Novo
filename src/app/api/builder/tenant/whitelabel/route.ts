import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
import { getWhitelabelConfig, saveWhitelabelConfig } from '@/platform/whitelabel/service';
import type { WhitelabelConfig } from '@/platform/whitelabel/types';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get('tenantSlug');
    if (!tenantSlug) {
      return NextResponse.json({ error: 'tenantSlug query param is required' }, { status: 400 });
    }
    const config = await getWhitelabelConfig(tenantSlug, pgPool);
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Partial<WhitelabelConfig> & { tenantSlug?: string };
    if (!body.tenantSlug) {
      return NextResponse.json({ error: 'tenantSlug is required' }, { status: 400 });
    }
    const config: WhitelabelConfig = {
      tenantSlug: body.tenantSlug,
      customDomain: body.customDomain,
      logoUrl: body.logoUrl,
      faviconUrl: body.faviconUrl,
      primaryColor: body.primaryColor,
      companyName: body.companyName,
      supportEmail: body.supportEmail,
      hideNovoBranding: body.hideNovoBranding ?? false,
      customCss: body.customCss,
    };
    await saveWhitelabelConfig(config, pgPool);
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
