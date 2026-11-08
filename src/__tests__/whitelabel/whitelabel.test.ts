import { getWhitelabelConfig, saveWhitelabelConfig, getConfigForDomain } from '@/platform/whitelabel/service';
import type { WhitelabelConfig } from '@/platform/whitelabel/types';

function makeMockPool(rows: Record<string, unknown>[] = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) };
}

const sampleRow = {
  tenant_slug: 'acme', custom_domain: 'erp.acme.com', logo_url: 'https://cdn.acme.com/logo.png',
  favicon_url: 'https://cdn.acme.com/favicon.ico', primary_color: '#ff5733',
  company_name: 'Acme Corp', support_email: 'support@acme.com', hide_novo_branding: true,
  custom_css: ':root { --primary: #ff5733; }',
};

describe('getWhitelabelConfig', () => {
  it('returns config from DB when record exists', async () => {
    const pool = makeMockPool([sampleRow]);
    const config = await getWhitelabelConfig('acme', pool as never);
    expect(config.tenantSlug).toBe('acme');
    expect(config.customDomain).toBe('erp.acme.com');
    expect(config.logoUrl).toBe('https://cdn.acme.com/logo.png');
    expect(config.primaryColor).toBe('#ff5733');
    expect(config.hideNovoBranding).toBe(true);
  });

  it('returns default config when no record exists', async () => {
    const pool = makeMockPool([]);
    const config = await getWhitelabelConfig('new-tenant', pool as never);
    expect(config.tenantSlug).toBe('new-tenant');
    expect(config.hideNovoBranding).toBe(false);
    expect(config.customDomain).toBeUndefined();
  });

  it('maps null DB values to undefined', async () => {
    const pool = makeMockPool([{ ...sampleRow, custom_domain: null, logo_url: null }]);
    const config = await getWhitelabelConfig('acme', pool as never);
    expect(config.customDomain).toBeUndefined();
    expect(config.logoUrl).toBeUndefined();
  });
});

describe('saveWhitelabelConfig', () => {
  it('calls upsert with correct parameters', async () => {
    const pool = makeMockPool();
    const config: WhitelabelConfig = {
      tenantSlug: 'acme', customDomain: 'erp.acme.com', logoUrl: 'https://cdn.acme.com/logo.png',
      primaryColor: '#ff5733', companyName: 'Acme Corp', supportEmail: 'support@acme.com',
      hideNovoBranding: true, customCss: ':root {}',
    };
    await saveWhitelabelConfig(config, pool as never);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO platform.whitelabel_configs');
    expect(sql).toContain('ON CONFLICT');
    expect(values[0]).toBe('acme');
    expect(values[1]).toBe('erp.acme.com');
    expect(values[7]).toBe(true);
  });

  it('passes null for optional fields that are undefined', async () => {
    const pool = makeMockPool();
    await saveWhitelabelConfig({ tenantSlug: 'acme', hideNovoBranding: false }, pool as never);
    const [, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(values[1]).toBeNull();
    expect(values[2]).toBeNull();
    expect(values[7]).toBe(false);
  });
});

describe('getConfigForDomain', () => {
  it('returns config when domain matches', async () => {
    const pool = makeMockPool([sampleRow]);
    const config = await getConfigForDomain('erp.acme.com', pool as never);
    expect(config).not.toBeNull();
    expect(config!.tenantSlug).toBe('acme');
  });

  it('returns null when domain is not found', async () => {
    const pool = makeMockPool([]);
    expect(await getConfigForDomain('unknown.example.com', pool as never)).toBeNull();
  });

  it('queries by domain', async () => {
    const pool = makeMockPool([sampleRow]);
    await getConfigForDomain('erp.acme.com', pool as never);
    const [sql, values] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('custom_domain');
    expect(values[0]).toBe('erp.acme.com');
  });
});
