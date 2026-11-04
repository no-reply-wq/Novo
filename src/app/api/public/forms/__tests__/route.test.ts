/**
 * Route-level security tests for /api/public/forms/[slug]
 *
 * These tests call the actual GET and POST route handlers with attack
 * payloads, not just the assertSchemaName guard in isolation.
 *
 * Strategy:
 *  - Mock resolveTenantFromSlug so each test controls the tenant returned
 *  - Mock tenantQuery so we can verify what SQL/params are actually called
 *  - Use attack inputs as tenant slugs and form data keys
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '../[slug]/route';

// ─── Mock dependencies ───────────────────────────────────────────────────────

const mockResolveTenant = jest.fn();
const mockTenantQuery = jest.fn();

jest.mock('@/lib/tenant/resolver', () => ({
  resolveTenantFromSlug: (...args: unknown[]) => mockResolveTenant(...args),
}));

jest.mock('@/lib/db/client', () => ({
  tenantQuery: (...args: unknown[]) => mockTenantQuery(...args),
}));

jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Use a unique IP for every request so the in-process rate limiter (20 req/min
// per IP) never fires across test cases.
let _testIpCounter = 0;
function uniqueIp(): string {
  _testIpCounter += 1;
  return `10.0.${Math.floor(_testIpCounter / 255)}.${_testIpCounter % 255 + 1}`;
}

function makeRequest(
  method: 'GET' | 'POST',
  slug: string,
  tenantParam: string,
  body?: unknown
): NextRequest {
  const url = `http://localhost/api/public/forms/${slug}?tenant=${encodeURIComponent(tenantParam)}`;
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': uniqueIp() },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function makeParams(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

const VALID_TENANT = {
  id: 'tenant-1',
  slug: 'acme',
  schemaName: 'tenant_acme',
  status: 'ACTIVE',
};

const FORM_ROW = {
  id: 'form-1',
  name: 'Test Form',
  slug: 'contact',
  description: null,
  is_active: true,
  is_public: true,
  public_settings: null,
};

const HEADER_FIELDS = [
  { key: 'name', label: 'Name', is_required: true, is_line_item: false },
  { key: 'email', label: 'Email', is_required: true, is_line_item: false },
];

const LINE_ITEM_FIELDS = [
  { key: 'product', label: 'Product', is_required: false, is_line_item: true },
  { key: 'qty', label: 'Qty', is_required: false, is_line_item: true },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── 1. Tenant not found ──────────────────────────────────────────────────────

describe('Tenant resolution', () => {
  it('GET returns 404 when tenant not found', async () => {
    mockResolveTenant.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'contact', 'nonexistent'), makeParams('contact'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Tenant not found');
    // tenantQuery must NEVER be called when tenant is missing
    expect(mockTenantQuery).not.toHaveBeenCalled();
  });

  it('POST returns 404 when tenant not found', async () => {
    mockResolveTenant.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'contact', 'ghost', { data: {} }), makeParams('contact'));
    expect(res.status).toBe(404);
    expect(mockTenantQuery).not.toHaveBeenCalled();
  });
});

// ── 2. Suspended tenant ──────────────────────────────────────────────────────

describe('Suspended tenant', () => {
  it('GET returns 404 for suspended tenant (not 403, to avoid info leak)', async () => {
    mockResolveTenant.mockResolvedValue({ ...VALID_TENANT, status: 'SUSPENDED' });
    const res = await GET(makeRequest('GET', 'contact', 'acme'), makeParams('contact'));
    expect(res.status).toBe(404);
    expect(mockTenantQuery).not.toHaveBeenCalled();
  });

  it('POST returns 404 for suspended tenant', async () => {
    mockResolveTenant.mockResolvedValue({ ...VALID_TENANT, status: 'SUSPENDED' });
    const res = await POST(makeRequest('POST', 'contact', 'acme', { data: {} }), makeParams('contact'));
    expect(res.status).toBe(404);
    expect(mockTenantQuery).not.toHaveBeenCalled();
  });
});

// ── 3. SQL injection via tenant slug ─────────────────────────────────────────

describe('SQL injection via tenant slug', () => {
  const attackSlugs = [
    "'; DROP TABLE tenants; --",
    "acme'; SELECT * FROM pg_tables; --",
    '1 OR 1=1',
    "admin'--",
    'tenant_acme; SET search_path TO public',
    "acme\x00injected",
    '../../../etc/passwd',
    'tenant_<script>alert(1)</script>',
  ];

  for (const slug of attackSlugs) {
    it(`GET: attack slug "${slug.slice(0, 40)}" is passed to resolveTenantFromSlug as-is (never interpolated into SQL)`, async () => {
      // resolver returns null → the route never touches tenantQuery
      mockResolveTenant.mockResolvedValue(null);
      const res = await GET(makeRequest('GET', 'contact', slug), makeParams('contact'));
      // Should be 404 — tenant not found, no DB query ran with the attack payload
      expect(res.status).toBe(404);
      // The slug was handed to resolveTenantFromSlug, not interpolated
      expect(mockResolveTenant).toHaveBeenCalledWith(slug);
      expect(mockTenantQuery).not.toHaveBeenCalled();
    });

    it(`POST: attack slug "${slug.slice(0, 40)}" — no raw SQL exposure`, async () => {
      mockResolveTenant.mockResolvedValue(null);
      const res = await POST(makeRequest('POST', 'contact', slug, { data: {} }), makeParams('contact'));
      expect(res.status).toBe(404);
      expect(mockResolveTenant).toHaveBeenCalledWith(slug);
      expect(mockTenantQuery).not.toHaveBeenCalled();
    });
  }
});

// ── 4. SQL injection via form data keys ──────────────────────────────────────

describe('SQL injection via form data keys', () => {
  beforeEach(() => {
    mockResolveTenant.mockResolvedValue(VALID_TENANT);
    // First tenantQuery call: form_configs lookup
    // Second tenantQuery call: form_fields lookup
    mockTenantQuery
      .mockResolvedValueOnce({ rows: [FORM_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [...HEADER_FIELDS, ...LINE_ITEM_FIELDS], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT
  });

  const attackKeys = [
    "'; DROP TABLE form_submissions; --",
    "name); DELETE FROM form_submissions; --",
    '1 UNION SELECT * FROM tenants',
    '__proto__',
    'constructor',
  ];

  for (const attackKey of attackKeys) {
    it(`POST: attack key "${attackKey.slice(0, 40)}" is silently dropped (not in field whitelist)`, async () => {
      const body = { data: { [attackKey]: 'evil', name: 'Alice', email: 'a@b.com' } };
      const res = await POST(makeRequest('POST', 'contact', 'acme', body), makeParams('contact'));

      // Should succeed (valid required fields were present)
      expect(res.status).toBe(201);

      // Find the INSERT call
      const insertCall = mockTenantQuery.mock.calls.find(call =>
        typeof call[1] === 'string' && call[1].includes('INSERT INTO form_submissions')
      );
      expect(insertCall).toBeDefined();

      // The header_data JSON (3rd param to tenantQuery) must NOT contain the attack key
      const headerDataJson = insertCall![2][2] as string; // $3 param
      const headerData = JSON.parse(headerDataJson);
      expect(Object.keys(headerData)).not.toContain(attackKey);
      // But valid keys should be present
      expect(headerData.name).toBe('Alice');
      expect(headerData.email).toBe('a@b.com');
    });
  }
});

// ── 5. Line-item key whitelisting ─────────────────────────────────────────────

describe('Line item key whitelisting', () => {
  beforeEach(() => {
    mockResolveTenant.mockResolvedValue(VALID_TENANT);
    mockTenantQuery
      .mockResolvedValueOnce({ rows: [FORM_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [...HEADER_FIELDS, ...LINE_ITEM_FIELDS], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  });

  it('strips non-whitelisted keys from line items', async () => {
    const body = {
      data: { name: 'Alice', email: 'a@b.com' },
      line_items: [
        { product: 'Widget', qty: 2, 'evil; DROP TABLE': 'x', __proto__: 'bad' },
      ],
    };
    const res = await POST(makeRequest('POST', 'contact', 'acme', body), makeParams('contact'));
    expect(res.status).toBe(201);

    const insertCall = mockTenantQuery.mock.calls.find(call =>
      typeof call[1] === 'string' && call[1].includes('INSERT INTO form_submissions')
    );
    const lineItemsJson = insertCall![2][3] as string; // $4 param
    const lineItems = JSON.parse(lineItemsJson);
    expect(lineItems[0]).toEqual({ product: 'Widget', qty: 2 });
    expect(lineItems[0]).not.toHaveProperty('evil; DROP TABLE');
    // __proto__ is a special JS property — check via Object.keys instead of toHaveProperty
    expect(Object.keys(lineItems[0])).not.toContain('__proto__');
  });

  it('rejects submissions with more than 200 line items', async () => {
    // Reset mocks (only need form + field queries for rejection before INSERT)
    mockTenantQuery
      .mockReset()
      .mockResolvedValueOnce({ rows: [FORM_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [...HEADER_FIELDS, ...LINE_ITEM_FIELDS], rowCount: 4 });

    const tooManyItems = Array.from({ length: 201 }, () => ({ product: 'x', qty: 1 }));
    const body = { data: { name: 'Alice', email: 'a@b.com' }, line_items: tooManyItems };
    const res = await POST(makeRequest('POST', 'contact', 'acme', body), makeParams('contact'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/too many line items/i);

    // INSERT must NOT have been called
    const insertCall = mockTenantQuery.mock.calls.find(call =>
      typeof call[1] === 'string' && call[1].includes('INSERT INTO')
    );
    expect(insertCall).toBeUndefined();
  });

  it('accepts exactly 200 line items', async () => {
    mockTenantQuery
      .mockReset()
      .mockResolvedValueOnce({ rows: [FORM_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [...HEADER_FIELDS, ...LINE_ITEM_FIELDS], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const maxItems = Array.from({ length: 200 }, () => ({ product: 'x', qty: 1 }));
    const body = { data: { name: 'Alice', email: 'a@b.com' }, line_items: maxItems };
    const res = await POST(makeRequest('POST', 'contact', 'acme', body), makeParams('contact'));
    expect(res.status).toBe(201);
  });
});

// ── 6. Raw error is never returned ──────────────────────────────────────────

describe('Error message safety', () => {
  it('POST never returns raw DB error message', async () => {
    mockResolveTenant.mockResolvedValue(VALID_TENANT);
    mockTenantQuery.mockRejectedValue(new Error('relation "form_configs" does not exist'));

    const body = { data: { name: 'Alice', email: 'a@b.com' } };
    const res = await POST(makeRequest('POST', 'contact', 'acme', body), makeParams('contact'));
    expect(res.status).toBe(500);
    const json = await res.json();
    // Must NOT contain any part of the raw DB error
    expect(json.error).not.toContain('relation');
    expect(json.error).not.toContain('form_configs');
    expect(json.error).not.toContain('does not exist');
    // Must be a safe, generic message
    expect(json.error).toMatch(/submission failed/i);
  });
});

// ── 7. Missing tenant param ──────────────────────────────────────────────────

describe('Missing parameters', () => {
  it('GET returns 400 when tenant param is missing', async () => {
    const req = new NextRequest('http://localhost/api/public/forms/contact', {
      method: 'GET',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    const res = await GET(req, makeParams('contact'));
    expect(res.status).toBe(400);
    expect(mockTenantQuery).not.toHaveBeenCalled();
  });

  it('POST returns 400 when tenant param is missing', async () => {
    const req = new NextRequest('http://localhost/api/public/forms/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify({ data: {} }),
    });
    const res = await POST(req, makeParams('contact'));
    expect(res.status).toBe(400);
    expect(mockTenantQuery).not.toHaveBeenCalled();
  });
});
