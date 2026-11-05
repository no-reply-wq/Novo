/**
 * API route tests for workflows.
 *
 * Tests the GET and POST handlers in isolation.
 */

import { NextRequest } from 'next/server';

// We need to reset module state between tests since the route uses a module-level Map
// Use jest.isolateModules to get a fresh store per test

describe('Workflows API route', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ appId: string }> }) => Promise<Response>;
  let POST: (req: NextRequest, ctx: { params: Promise<{ appId: string }> }) => Promise<Response>;

  beforeEach(() => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const route = require('../app/api/builder/apps/[appId]/workflows/route') as {
        GET: typeof GET;
        POST: typeof POST;
      };
      GET = route.GET;
      POST = route.POST;
    });
  });

  it('GET returns empty workflows for a new appId', async () => {
    const req = new NextRequest('http://localhost/api/builder/apps/app1/workflows');
    const params = Promise.resolve({ appId: 'app1' });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workflows: unknown[] };
    expect(Array.isArray(body.workflows)).toBe(true);
    expect(body.workflows.length).toBe(0);
  });

  it('POST creates a new workflow', async () => {
    const req = new NextRequest('http://localhost/api/builder/apps/app1/workflows', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Workflow' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const params = Promise.resolve({ appId: 'app1' });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { workflow: { name: string; id: string } };
    expect(body.workflow.name).toBe('My Workflow');
    expect(body.workflow.id).toBeTruthy();
  });
});

describe('Workflows detail API route', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ appId: string; workflowId: string }> }) => Promise<Response>;
  let PUT: (req: NextRequest, ctx: { params: Promise<{ appId: string; workflowId: string }> }) => Promise<Response>;
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ appId: string; workflowId: string }> }) => Promise<Response>;

  beforeEach(() => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const route = require('../app/api/builder/apps/[appId]/workflows/[workflowId]/route') as {
        GET: typeof GET;
        PUT: typeof PUT;
        DELETE: typeof DELETE;
      };
      GET = route.GET;
      PUT = route.PUT;
      DELETE = route.DELETE;
    });
  });

  it('GET returns 404 for unknown workflowId', async () => {
    const req = new NextRequest('http://localhost/api/builder/apps/app1/workflows/unknown');
    const params = Promise.resolve({ appId: 'app1', workflowId: 'unknown' });
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it('PUT returns 404 for unknown workflowId', async () => {
    const req = new NextRequest('http://localhost/api/builder/apps/app1/workflows/unknown', {
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
      headers: { 'Content-Type': 'application/json' },
    });
    const params = Promise.resolve({ appId: 'app1', workflowId: 'unknown' });
    const res = await PUT(req, { params });
    expect(res.status).toBe(404);
  });

  it('DELETE returns 404 for unknown workflowId', async () => {
    const req = new NextRequest('http://localhost/api/builder/apps/app1/workflows/unknown', {
      method: 'DELETE',
    });
    const params = Promise.resolve({ appId: 'app1', workflowId: 'unknown' });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(404);
  });
});
