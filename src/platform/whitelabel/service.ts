import { Pool } from 'pg';
import type { WhitelabelConfig } from './types';

function rowToConfig(row: Record<string, unknown>): WhitelabelConfig {
  return {
    tenantSlug: String(row.tenant_slug ?? ''),
    customDomain: (row.custom_domain as string | null) ?? undefined,
    logoUrl: (row.logo_url as string | null) ?? undefined,
    faviconUrl: (row.favicon_url as string | null) ?? undefined,
    primaryColor: (row.primary_color as string | null) ?? undefined,
    companyName: (row.company_name as string | null) ?? undefined,
    supportEmail: (row.support_email as string | null) ?? undefined,
    hideNovoBranding: Boolean(row.hide_novo_branding),
    customCss: (row.custom_css as string | null) ?? undefined,
  };
}

export async function getWhitelabelConfig(tenantSlug: string, pgPool: Pool): Promise<WhitelabelConfig> {
  const res = await pgPool.query<Record<string, unknown>>(
    `SELECT * FROM platform.whitelabel_configs WHERE tenant_slug = $1`,
    [tenantSlug],
  );
  if (!res.rows.length) {
    return { tenantSlug, hideNovoBranding: false };
  }
  return rowToConfig(res.rows[0]);
}

export async function saveWhitelabelConfig(config: WhitelabelConfig, pgPool: Pool): Promise<void> {
  await pgPool.query(
    `INSERT INTO platform.whitelabel_configs
       (tenant_slug, custom_domain, logo_url, favicon_url, primary_color, company_name, support_email, hide_novo_branding, custom_css)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (tenant_slug) DO UPDATE SET
       custom_domain   = EXCLUDED.custom_domain,
       logo_url        = EXCLUDED.logo_url,
       favicon_url     = EXCLUDED.favicon_url,
       primary_color   = EXCLUDED.primary_color,
       company_name    = EXCLUDED.company_name,
       support_email   = EXCLUDED.support_email,
       hide_novo_branding = EXCLUDED.hide_novo_branding,
       custom_css      = EXCLUDED.custom_css`,
    [
      config.tenantSlug,
      config.customDomain ?? null,
      config.logoUrl ?? null,
      config.faviconUrl ?? null,
      config.primaryColor ?? null,
      config.companyName ?? null,
      config.supportEmail ?? null,
      config.hideNovoBranding,
      config.customCss ?? null,
    ],
  );
}

export async function getConfigForDomain(domain: string, pgPool: Pool): Promise<WhitelabelConfig | null> {
  const res = await pgPool.query<Record<string, unknown>>(
    `SELECT * FROM platform.whitelabel_configs WHERE custom_domain = $1`,
    [domain],
  );
  if (!res.rows.length) return null;
  return rowToConfig(res.rows[0]);
}
