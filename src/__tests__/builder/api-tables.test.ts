/**
 * API route unit tests — tables CRUD.
 * Tests the route handler logic by mocking DB and auth.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/tenant-session', () => ({
  requirePermission: jest.fn(),
}));

jest.mock('@/lib/db/client', () => ({
  tenantQuery: jest.fn(),
  pgPool: {},
}));

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}));

import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';

const mockRequirePermission = requirePermission as jest.MockedFunction<typeof requirePermission>;
const mockTenantQuery = tenantQuery as jest.MockedFunction<typeof tenantQuery>;

function makeTenantCtx() {
  return {
    tenant: { id: 't1', slug: 'test-tenant' } as never,
    userId: 'u1',
    tenantUserId: 'u1',
    schemaName: 'tenant_test_tenant',
    permissions: {} as never,
  };
}

function makeRequest(method: string, body?: unknown, search?: Record<string, string>): Request {
  const url = new URL(`http://localhost/api/builder/apps/app1/tables`);
  if (search) {
    for (const [k, v] of Object.entries(search)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─── GET /api/builder/apps/[appId]/tables ─────────────────────────────────────

describe('GET /api/builder/apps/[appId]/tables', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when tenant is missing', async () => {
    const { GET } = await import('@/app/api/builder/apps/[appId]/tables/route');
    const req = makeRequest('GET');
    const res = await GET(req as never, { params: Promise.resolve({ appId: 'app1' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing tenant');
  });

  it('returns 200 with tables list', async () => {
    mockRequirePermission.mockResolvedValue(makeTenantCtx() as never);
    // ensureMeta calls (2 creates) + listTables query
    mockTenantQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 't1', label: 'Orders', slug: 'orders', field_count: 3 }] } as never);

    const { GET } = await import('@/app/api/builder/apps/[appId]/tables/route');
    const req = makeRequest('GET', undefined, { tenant: 'test-tenant' });
    const res = await GET(req as never, { params: Promise.resolve({ appId: 'app1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tables).toHaveLength(1);
    expect(json.tables[0].label).toBe('Orders');
  });
});

// ─── POST /api/builder/apps/[appId]/tables ────────────────────────────────────

describe('POST /api/builder/apps/[appId]/tables', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when name is missing', async () => {
    mockRequirePermission.mockResolvedValue(makeTenantCtx() as never);
    mockTenantQuery.mockResolvedValue({ rows: [] } as never);

    const { POST } = await import('@/app/api/builder/apps/[appId]/tables/route');
    const req = makeRequest('POST', {}, { tenant: 'test-tenant' });
    const res = await POST(req as never, { params: Promise.resolve({ appId: 'app1' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('name');
  });

  it('returns 400 for invalid apiKey', async () => {
    mockRequirePermission.mockResolvedValue(makeTenantCtx() as never);
    mockTenantQuery.mockResolvedValue({ rows: [] } as never);

    const { POST } = await import('@/app/api/builder/apps/[appId]/tables/route');
    const req = makeRequest('POST', { name: 'Orders', apiKey: '1invalid' }, { tenant: 'test-tenant' });
    const res = await POST(req as never, { params: Promise.resolve({ appId: 'app1' }) });
    expect(res.status).toBe(400);
  });

  it('creates table and returns 201', async () => {
    mockRequirePermission.mockResolvedValue(makeTenantCtx() as never);
    const createdTable = { id: 'mock-uuid-1234', label: 'Orders', slug: 'orders', app_id: 'app1' };
    mockTenantQuery
      .mockResolvedValueOnce({ rows: [] } as never) // ensureMeta 1
      .mockResolvedValueOnce({ rows: [] } as never) // ensureMeta 2
      .mockResolvedValueOnce({ rows: [createdTable] } as never) // INSERT _tables
      .mockResolvedValueOnce({ rows: [] } as never) // CREATE TABLE ct_orders
      .mockResolvedValueOnce({ rows: [] } as never); // INSERT system fields

    const { POST } = await import('@/app/api/builder/apps/[appId]/tables/route');
    const req = makeRequest('POST', { name: 'Orders', apiKey: 'orders' }, { tenant: 'test-tenant' });
    const res = await POST(req as never, { params: Promise.resolve({ appId: 'app1' }) });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.table.label).toBe('Orders');
  });
});

// ─── DELETE /api/builder/apps/[appId]/tables/[tableId] ───────────────────────

describe('DELETE /api/builder/apps/[appId]/tables/[tableId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 404 when table not found', async () => {
    mockRequirePermission.mockResolvedValue(makeTenantCtx() as never);
    mockTenantQuery.mockResolvedValueOnce({ rows: [] } as never);

    const { DELETE } = await import('@/app/api/builder/apps/[appId]/tables/[tableId]/route');
    const req = makeRequest('DELETE', undefined, { tenant: 'test-tenant' });
    const res = await DELETE(req as never, { params: Promise.resolve({ appId: 'app1', tableId: 'nonexistent' }) });
    expect(res.status).toBe(404);
  });

  it('deletes table and returns ok', async () => {
    mockRequirePermission.mockResolvedValue(makeTenantCtx() as never);
    mockTenantQuery
      .mockResolvedValueOnce({ rows: [{ slug: 'orders' }] } as never) // SELECT slug
      .mockResolvedValueOnce({ rows: [] } as never) // DROP TABLE
      .mockResolvedValueOnce({ rows: [] } as never); // DELETE FROM _tables

    const { DELETE } = await import('@/app/api/builder/apps/[appId]/tables/[tableId]/route');
    const req = makeRequest('DELETE', undefined, { tenant: 'test-tenant' });
    const res = await DELETE(req as never, { params: Promise.resolve({ appId: 'app1', tableId: 'table1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
