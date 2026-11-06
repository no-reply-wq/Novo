import { GET } from '../route';
import { readFileSync } from 'fs';

// ── Mock next/server ──────────────────────────────────────────
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      json: async () => body,
      status: init?.status ?? 200,
      _body: body,
    }),
  },
}));

// ── Mock DB client ────────────────────────────────────────────
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();

jest.mock('@/lib/db/client', () => ({
  pgPool: {
    connect: () => mockConnect(),
  },
}));

// ── Mock fs for migrations dir ────────────────────────────────
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readdirSync: jest.fn((dir: string) => {
      if (String(dir).includes('platform')) {
        return ['001_tables.sql', '002_more.sql'];
      }
      return actual.readdirSync(dir);
    }),
    readFileSync: jest.fn((path: string, encoding?: string) => {
      if (String(path).endsWith('package.json') && encoding === 'utf8') {
        return JSON.stringify({ version: '0.1.0' });
      }
      return actual.readFileSync(path, encoding as BufferEncoding);
    }),
  };
});

describe('GET /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function setupHealthyDb(applied = 2): void {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // SELECT 1
      .mockResolvedValueOnce({ rows: [{ count: String(applied) }] }); // COUNT migrations
    mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });
  }

  it('returns 200 when database is up and migrations are current', async () => {
    setupHealthyDb(2);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('returns 503 when database is down', async () => {
    mockConnect.mockRejectedValue(new Error('connection refused'));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('down');
    expect(body.checks.database.status).toBe('fail');
    expect(body.checks.database.error).toMatch(/connection refused/);
  });

  it('response includes all required check fields', async () => {
    setupHealthyDb(2);

    const res = await GET();
    const body = await res.json();

    // Top-level shape
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
    expect(['ok', 'degraded', 'down']).toContain(body.status);

    // database check
    expect(body.checks.database).toMatchObject({ status: expect.any(String) });

    // migrations check
    expect(body.checks.migrations).toMatchObject({
      status: expect.any(String),
      applied: expect.any(Number),
      expected: expect.any(Number),
    });

    // memory check
    expect(body.checks.memory).toMatchObject({
      status: expect.any(String),
      heapUsedMb: expect.any(Number),
      heapTotalMb: expect.any(Number),
    });
  });

  it('version matches the value from package.json', async () => {
    setupHealthyDb(2);

    const res = await GET();
    const body = await res.json();

    expect(body.version).toBe('0.1.0');
  });

  it('returns degraded when applied migrations are less than expected', async () => {
    // DB healthy but only 1 of 2 migrations applied
    mockQuery
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });

    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe('degraded');
    expect(body.checks.migrations.status).toBe('warn');
    expect(body.checks.migrations.applied).toBe(1);
    expect(body.checks.migrations.expected).toBe(2);
  });
});
