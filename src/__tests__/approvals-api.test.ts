/**
 * API route tests for approvals.
 */

import { NextRequest } from 'next/server';

describe('Approvals API route', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ appId: string }> }) => Promise<Response>;
  let POST: (req: NextRequest, ctx: { params: Promise<{ appId: string }> }) => Promise<Response>;

  beforeEach(() => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const route = require('../app/api/builder/apps/[appId]/approvals/route') as {
        GET: typeof GET;
        POST: typeof POST;
      };
      GET = route.GET;
      POST = route.POST;
    });
  });

  it('GET returns empty chains for a new appId', async () => {
    const req = new NextRequest('http://localhost/api/builder/apps/app1/approvals');
    const res = await GET(req, { params: Promise.resolve({ appId: 'app1' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chains: unknown[] };
    expect(Array.isArray(body.chains)).toBe(true);
  });

  it('POST creates a new chain', async () => {
    const req = new NextRequest('http://localhost/api/builder/apps/app1/approvals', {
      method: 'POST',
      body: JSON.stringify({ name: 'PO Approval', tableId: 'purchase_orders', levels: [] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ appId: 'app1' }) });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { chain: { name: string; id: string } };
    expect(body.chain.name).toBe('PO Approval');
    expect(body.chain.id).toBeTruthy();
  });
});
