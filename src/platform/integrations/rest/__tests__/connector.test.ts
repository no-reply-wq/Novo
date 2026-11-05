/**
 * Tests for REST connector executor.
 * Covers auth header generation, variable interpolation, SSRF guard, and response mapping.
 */

import { jest } from '@jest/globals';

// ── Mock DNS ───────────────────────────────────────────────────────────────────
const mockDnsLookup = jest.fn<() => Promise<Array<{ address: string; family: number }>>>();
jest.mock('dns/promises', () => ({ lookup: mockDnsLookup }));

// ── Mock fetch ─────────────────────────────────────────────────────────────────
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

// ── Mock DB ────────────────────────────────────────────────────────────────────
const mockQuery = jest.fn<(sql: unknown, params?: unknown[]) => Promise<{ rows: unknown[] }>>();
jest.mock('@/lib/db/client', () => ({
  pgPool: { query: mockQuery },
}));

// ── Mock secrets ───────────────────────────────────────────────────────────────
jest.mock('../../secrets', () => ({
  decryptSecret: jest.fn<(enc: string, _t: string) => string>().mockImplementation(
    (enc: string) => `plain:${enc}`
  ),
}));

process.env['PLATFORM_SECRET'] = 'test-platform-secret-for-unit-tests';

import {
  executeRestRequest,
  SsrfBlockedError,
  ConnectorRequestNotFoundError,
} from '../connector';
import { NotConfiguredError } from '../../secrets/manager';

const makeJson = (data: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 400,
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }) as unknown as Response;

const baseConfig: Record<string, string> = {
  baseUrl: 'https://api.example.com',
  auth: JSON.stringify({ type: 'bearer', token: 'enc-token' }),
  requests: JSON.stringify([
    {
      name: 'get_user',
      method: 'GET',
      path: '/users/{{userId}}',
      responseMapping: { 'data.name': 'userName' },
    },
    {
      name: 'create_order',
      method: 'POST',
      path: '/orders',
      bodyTemplate: '{"customer":"{{customer}}","amount":{{amount}}}',
    },
  ]),
};

describe('executeRestRequest — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: '203.0.113.1', family: 4 }]);
    mockQuery.mockResolvedValue({ rows: [{ config: baseConfig }] });
  });

  it('makes a GET request to the rendered path', async () => {
    mockFetch.mockResolvedValueOnce(makeJson({ data: { name: 'Alice' } }));

    await executeRestRequest({
      tenantSlug: 'acme',
      connectorId: 'conn-1',
      requestName: 'get_user',
      variables: { userId: '42' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/users/42',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('injects bearer token from auth config', async () => {
    mockFetch.mockResolvedValueOnce(makeJson({ data: { name: 'Bob' } }));

    await executeRestRequest({
      tenantSlug: 'acme',
      connectorId: 'conn-1',
      requestName: 'get_user',
      variables: { userId: '1' },
    });

    const headers = (mockFetch.mock.calls[0]?.[1] as RequestInit)?.headers as Record<string, string>;
    expect(headers?.['Authorization']).toBe('Bearer plain:enc-token');
  });

  it('applies response mapping', async () => {
    mockFetch.mockResolvedValueOnce(makeJson({ data: { name: 'Carol' } }));

    const result = (await executeRestRequest({
      tenantSlug: 'acme',
      connectorId: 'conn-1',
      requestName: 'get_user',
      variables: { userId: '3' },
    })) as Record<string, unknown>;

    expect(result['userName']).toBe('Carol');
  });

  it('renders body template for POST', async () => {
    mockFetch.mockResolvedValueOnce(makeJson({ id: 'order-1' }));

    await executeRestRequest({
      tenantSlug: 'acme',
      connectorId: 'conn-1',
      requestName: 'create_order',
      variables: { customer: 'cust-7', amount: 1500 },
    });

    const body = (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string;
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed['customer']).toBe('cust-7');
    expect(parsed['amount']).toBe(1500);
  });
});

describe('executeRestRequest — auth types', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: '203.0.113.1', family: 4 }]);
    mockFetch.mockResolvedValue(makeJson({ ok: true }));
  });

  it('sets X-API-Key header for api_key auth', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        config: {
          ...baseConfig,
          auth: JSON.stringify({ type: 'api_key', headerName: 'X-API-Key', apiKey: 'enc-key' }),
        },
      }],
    });

    await executeRestRequest({
      tenantSlug: 'acme',
      connectorId: 'c1',
      requestName: 'get_user',
      variables: { userId: '1' },
    });

    const headers = (mockFetch.mock.calls[0]?.[1] as RequestInit)?.headers as Record<string, string>;
    expect(headers?.['X-API-Key']).toBe('plain:enc-key');
  });

  it('sets Basic auth header', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        config: {
          ...baseConfig,
          auth: JSON.stringify({ type: 'basic', credentials: 'enc-creds' }),
        },
      }],
    });

    await executeRestRequest({
      tenantSlug: 'acme',
      connectorId: 'c1',
      requestName: 'get_user',
      variables: { userId: '1' },
    });

    const headers = (mockFetch.mock.calls[0]?.[1] as RequestInit)?.headers as Record<string, string>;
    // 'plain:enc-creds' encoded as base64
    const expected = `Basic ${Buffer.from('plain:enc-creds').toString('base64')}`;
    expect(headers?.['Authorization']).toBe(expected);
  });

  it('no auth header for none type', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        config: {
          ...baseConfig,
          auth: JSON.stringify({ type: 'none' }),
        },
      }],
    });

    await executeRestRequest({
      tenantSlug: 'acme',
      connectorId: 'c1',
      requestName: 'get_user',
      variables: { userId: '1' },
    });

    const headers = (mockFetch.mock.calls[0]?.[1] as RequestInit)?.headers as Record<string, string>;
    expect(headers?.['Authorization']).toBeUndefined();
  });
});

describe('executeRestRequest — SSRF guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ config: baseConfig }] });
  });

  it('blocks requests to 169.254.169.254 (AWS metadata)', async () => {
    mockDnsLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    await expect(
      executeRestRequest({
        tenantSlug: 'acme',
        connectorId: 'c1',
        requestName: 'get_user',
        variables: { userId: '1' },
      })
    ).rejects.toThrow(SsrfBlockedError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks localhost', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        config: { ...baseConfig, baseUrl: 'https://localhost:9200' },
      }],
    });
    mockDnsLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(
      executeRestRequest({
        tenantSlug: 'acme',
        connectorId: 'c1',
        requestName: 'get_user',
        variables: { userId: '1' },
      })
    ).rejects.toThrow(SsrfBlockedError);
  });
});

describe('executeRestRequest — error cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: '203.0.113.1', family: 4 }]);
    mockQuery.mockResolvedValue({ rows: [{ config: baseConfig }] });
  });

  it('throws ConnectorRequestNotFoundError for unknown request', async () => {
    await expect(
      executeRestRequest({
        tenantSlug: 'acme',
        connectorId: 'c1',
        requestName: 'nonexistent',
        variables: {},
      })
    ).rejects.toThrow(ConnectorRequestNotFoundError);
  });

  it('throws NotConfiguredError when no integration found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      executeRestRequest({
        tenantSlug: 'no-tenant',
        connectorId: 'c1',
        requestName: 'get_user',
        variables: {},
      })
    ).rejects.toThrow(NotConfiguredError);
  });

  it('throws on non-OK API response', async () => {
    mockFetch.mockResolvedValueOnce(makeJson({ error: 'not found' }, false));

    await expect(
      executeRestRequest({
        tenantSlug: 'acme',
        connectorId: 'c1',
        requestName: 'get_user',
        variables: { userId: '999' },
      })
    ).rejects.toThrow('400');
  });
});
