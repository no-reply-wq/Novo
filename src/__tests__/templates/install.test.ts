/**
 * Template install API tests.
 * Mocks the DB and verifies the install handler creates an app correctly.
 */
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockQuery = jest.fn();
jest.mock('@/lib/db/client', () => ({
  pgPool: { query: mockQuery },
}));

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock('@/lib/auth/config', () => ({ authOptions: {} }));

// Import AFTER mocks are set up
import { POST } from '@/app/api/builder/templates/[templateId]/install/route';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRequest(templateId: string, body: Record<string, unknown>) {
  const url = `http://localhost/api/builder/templates/${templateId}/install`;
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('POST /api/builder/templates/[templateId]/install', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    mockGetServerSession.mockResolvedValue({
      user: { tenantSlug: 'acme', email: 'admin@acme.com' },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const req = makeRequest('lms-starter', { tenant: 'acme' });
    const res = await POST(req, { params: Promise.resolve({ templateId: 'lms-starter' }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 when tenant does not match session', async () => {
    const req = makeRequest('lms-starter', { tenant: 'other-tenant' });
    const res = await POST(req, { params: Promise.resolve({ templateId: 'lms-starter' }) });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown template', async () => {
    const req = makeRequest('nonexistent-template', { tenant: 'acme' });
    const res = await POST(req, { params: Promise.resolve({ templateId: 'nonexistent-template' }) });
    expect(res.status).toBe(404);
  });

  it('creates an app row and bundle row for lms-starter', async () => {
    const req = makeRequest('lms-starter', { tenant: 'acme' });
    const res = await POST(req, { params: Promise.resolve({ templateId: 'lms-starter' }) });
    expect(res.status).toBe(201);

    // Should have called pgPool.query twice: insert app + insert bundle
    expect(mockQuery).toHaveBeenCalledTimes(2);

    const [appSql, appParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(appSql).toContain('INSERT INTO public.apps');
    expect(appParams[1]).toBe('acme');
    expect(appParams[2]).toBe('Learning Management System');

    const [bundleSql, bundleParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(bundleSql).toContain('INSERT INTO public.app_bundles');
    expect(bundleParams[2]).toBe('acme');

    const bundleJson = JSON.parse(bundleParams[4] as string) as { schemaVersion: string };
    expect(bundleJson.schemaVersion).toBe('1.0');
  });

  it('allows overriding the app name', async () => {
    const req = makeRequest('crm-starter', { tenant: 'acme', name: 'My Custom CRM' });
    const res = await POST(req, { params: Promise.resolve({ templateId: 'crm-starter' }) });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { app: { name: string } };
    expect(body.app.name).toBe('My Custom CRM');

    const [, appParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(appParams[2]).toBe('My Custom CRM');
  });

  it('returns 422 for missing tenant', async () => {
    const req = makeRequest('lms-starter', {});
    const res = await POST(req, { params: Promise.resolve({ templateId: 'lms-starter' }) });
    expect(res.status).toBe(422);
  });
});
