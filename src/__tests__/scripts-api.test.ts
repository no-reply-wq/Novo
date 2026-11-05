/**
 * API route tests for scripts.
 */

import { NextRequest } from 'next/server';

describe('Scripts API route', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ appId: string }> }) => Promise<Response>;
  let POST: (req: NextRequest, ctx: { params: Promise<{ appId: string }> }) => Promise<Response>;

  beforeEach(() => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const route = require('../app/api/builder/apps/[appId]/scripts/route') as {
        GET: typeof GET;
        POST: typeof POST;
      };
      GET = route.GET;
      POST = route.POST;
    });
  });

  it('GET returns empty scripts for a new appId', async () => {
    const req = new NextRequest('http://localhost/api/builder/apps/app1/scripts');
    const res = await GET(req, { params: Promise.resolve({ appId: 'app1' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scripts: unknown[] };
    expect(Array.isArray(body.scripts)).toBe(true);
  });

  it('POST creates a new script', async () => {
    const req = new NextRequest('http://localhost/api/builder/apps/app1/scripts', {
      method: 'POST',
      body: JSON.stringify({ name: 'My Script', code: 'async function main(input, sdk) { return {}; }' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ appId: 'app1' }) });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { script: { name: string; id: string; language: string } };
    expect(body.script.name).toBe('My Script');
    expect(body.script.language).toBe('javascript');
  });
});

describe('Script test endpoint', () => {
  it('runs a simple script and returns output', async () => {
    jest.isolateModules(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { POST } = require('../app/api/builder/apps/[appId]/scripts/[scriptId]/test/route') as {
        POST: (
          req: NextRequest,
          ctx: { _params: Promise<{ appId: string; scriptId: string }> },
        ) => Promise<Response>;
      };

      const req = new NextRequest(
        'http://localhost/api/builder/apps/app1/scripts/s1/test',
        {
          method: 'POST',
          body: JSON.stringify({
            input: { amount: 100 },
            code: 'async function main(input, sdk) { return { doubled: input.amount * 2 }; }',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const res = await POST(req, { _params: Promise.resolve({ appId: 'app1', scriptId: 's1' }) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: { doubled: number }; error?: string; durationMs: number };
      expect(body.error).toBeUndefined();
      expect(body.output).toEqual({ doubled: 200 });
      expect(typeof body.durationMs).toBe('number');
    });
  });

  it('returns error when script throws', async () => {
    jest.isolateModules(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { POST } = require('../app/api/builder/apps/[appId]/scripts/[scriptId]/test/route') as {
        POST: (
          req: NextRequest,
          ctx: { _params: Promise<{ appId: string; scriptId: string }> },
        ) => Promise<Response>;
      };

      const req = new NextRequest(
        'http://localhost/api/builder/apps/app1/scripts/s1/test',
        {
          method: 'POST',
          body: JSON.stringify({
            input: {},
            code: 'async function main(input, sdk) { throw new Error("test error"); }',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const res = await POST(req, { _params: Promise.resolve({ appId: 'app1', scriptId: 's1' }) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain('test error');
    });
  });
});
