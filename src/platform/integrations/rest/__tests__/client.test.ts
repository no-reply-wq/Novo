/**
 * client.test.ts
 * Tests for RESTClient — URL assembly, auth headers, body template,
 * response mapping, SSRF guard, and 4xx handling.
 */

import { jest } from '@jest/globals';

// ── Mock DNS ───────────────────────────────────────────────────────────────────
const mockDnsLookup = jest.fn<() => Promise<Array<{ address: string; family: number }>>>();
jest.mock('dns/promises', () => ({ lookup: mockDnsLookup }));

// ── Mock fetch ─────────────────────────────────────────────────────────────────
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (h: string) => (h === 'content-type' ? 'application/json' : null),
    },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function makeTextResponse(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'text/plain' },
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

import { RESTClient, SsrfBlockedError, RequestNotFoundError } from '../client';
import type { RESTConnector } from '../types';

// ── Shared connector fixture ───────────────────────────────────────────────────

function makeConnector(overrides: Partial<RESTConnector> = {}): RESTConnector {
  return {
    id: 'conn-1',
    appId: 'app-1',
    name: 'Test API',
    baseUrl: 'https://api.example.com',
    authType: 'none',
    authConfig: { type: 'none' },
    defaultHeaders: {},
    requests: [
      {
        id: 'req-get',
        name: 'get_user',
        method: 'GET',
        path: '/users/{{ userId }}',
        responseMapping: { 'data.name': 'userName' },
      },
      {
        id: 'req-post',
        name: 'create_order',
        method: 'POST',
        path: '/orders',
        bodyTemplate: '{"customer":"{{ customer }}","amount":{{ amount }}}',
      },
    ],
    ...overrides,
  };
}

const mockSecrets = jest.fn<(key: string) => Promise<string>>()
  .mockImplementation((key: string) => Promise.resolve(`secret-${key}`));

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockDnsLookup.mockResolvedValue([{ address: '203.0.113.1', family: 4 }]);
});

describe('GET request — URL assembly', () => {
  it('calls the correct URL with path params interpolated', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ data: { name: 'Alice' } }));

    const client = new RESTClient(makeConnector(), mockSecrets);
    await client.execute('req-get', { userId: '42' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/users/42',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('uses correct HTTP method', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}));
    const client = new RESTClient(makeConnector(), mockSecrets);
    await client.execute('req-get', { userId: '1' });
    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
  });
});

describe('Bearer auth', () => {
  it('sets Authorization: Bearer header', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}));

    const connector = makeConnector({
      authType: 'bearer',
      authConfig: { type: 'bearer', tokenRef: 'MY_TOKEN' },
    });
    const client = new RESTClient(connector, mockSecrets);
    await client.execute('req-get', { userId: '1' });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret-MY_TOKEN');
  });
});

describe('API key auth', () => {
  it('sets custom header with key value', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}));

    const connector = makeConnector({
      authType: 'api_key',
      authConfig: { type: 'api_key', headerName: 'X-API-Key', keyRef: 'MY_API_KEY' },
    });
    const client = new RESTClient(connector, mockSecrets);
    await client.execute('req-get', { userId: '1' });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('secret-MY_API_KEY');
  });
});

describe('Basic auth', () => {
  it('sets Authorization: Basic header with base64 credentials', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}));

    const connector = makeConnector({
      authType: 'basic',
      authConfig: { type: 'basic', username: 'user', passwordRef: 'PASS_REF' },
    });
    const client = new RESTClient(connector, mockSecrets);
    await client.execute('req-get', { userId: '1' });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    const expected = Buffer.from('user:secret-PASS_REF').toString('base64');
    expect(headers['Authorization']).toBe(`Basic ${expected}`);
  });
});

describe('Body template rendering', () => {
  it('renders body template with params', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: 'ord-1' }));

    const client = new RESTClient(makeConnector(), mockSecrets);
    await client.execute('req-post', { customer: 'Acme', amount: 100 });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe('{"customer":"Acme","amount":100}');
  });

  it('sets Content-Type: application/json when body is present', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}));
    const client = new RESTClient(makeConnector(), mockSecrets);
    await client.execute('req-post', { customer: 'Acme', amount: 50 });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });
});

describe('Response mapping', () => {
  it('extracts fields using dot-notation JSONPath', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ data: { name: 'Bob', age: 30 } }));
    const client = new RESTClient(makeConnector(), mockSecrets);
    const result = await client.execute('req-get', { userId: '1' });
    expect(result.mapped['userName']).toBe('Bob');
  });

  it('returns empty mapped when no responseMapping configured', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: 'ord-1' }));
    const client = new RESTClient(makeConnector(), mockSecrets);
    const result = await client.execute('req-post', { customer: 'x', amount: 1 });
    expect(result.mapped).toEqual({});
  });
});

describe('SSRF guard', () => {
  it('blocks http://localhost', async () => {
    // DNS resolves localhost → loopback
    mockDnsLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const connector = makeConnector({ baseUrl: 'http://localhost:3000' });
    const client = new RESTClient(connector, mockSecrets);
    await expect(client.execute('req-get', { userId: '1' })).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('blocks http://10.0.0.1 (private range)', async () => {
    mockDnsLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
    const connector = makeConnector({ baseUrl: 'http://10.0.0.1' });
    const client = new RESTClient(connector, mockSecrets);
    await expect(client.execute('req-get', { userId: '1' })).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('blocks http://192.168.1.1 (private range)', async () => {
    mockDnsLookup.mockResolvedValue([{ address: '192.168.1.1', family: 4 }]);
    const connector = makeConnector({ baseUrl: 'http://192.168.1.1' });
    const client = new RESTClient(connector, mockSecrets);
    await expect(client.execute('req-get', { userId: '1' })).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('allows public IP addresses', async () => {
    mockDnsLookup.mockResolvedValue([{ address: '203.0.113.5', family: 4 }]);
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}));
    const client = new RESTClient(makeConnector(), mockSecrets);
    await expect(client.execute('req-get', { userId: '1' })).resolves.toBeDefined();
  });
});

describe('4xx responses', () => {
  it('returns error result without throwing for 404', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'not found' }, 404));
    const client = new RESTClient(makeConnector(), mockSecrets);
    const result = await client.execute('req-get', { userId: '999' });
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: 'not found' });
  });

  it('returns error result without throwing for 400', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ message: 'bad request' }, 400));
    const client = new RESTClient(makeConnector(), mockSecrets);
    const result = await client.execute('req-post', { customer: '', amount: 0 });
    expect(result.status).toBe(400);
  });

  it('returns error result without throwing for 401', async () => {
    mockFetch.mockResolvedValueOnce(makeTextResponse('Unauthorized', 401));
    const client = new RESTClient(makeConnector(), mockSecrets);
    const result = await client.execute('req-get', { userId: '1' });
    expect(result.status).toBe(401);
    expect(result.body).toBe('Unauthorized');
  });
});

describe('Request not found', () => {
  it('throws RequestNotFoundError for unknown requestId', async () => {
    const client = new RESTClient(makeConnector(), mockSecrets);
    await expect(client.execute('req-nonexistent', {})).rejects.toBeInstanceOf(RequestNotFoundError);
  });
});

describe('Query params', () => {
  it('appends interpolated query params to URL', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}));
    const connector = makeConnector({
      requests: [
        {
          id: 'req-search',
          name: 'search',
          method: 'GET',
          path: '/search',
          queryParams: { q: '{{ query }}', limit: '{{ limit }}' },
        },
      ],
    });
    const client = new RESTClient(connector, mockSecrets);
    await client.execute('req-search', { query: 'alice', limit: '10' });

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('q=alice');
    expect(calledUrl).toContain('limit=10');
  });
});

describe('Default headers', () => {
  it('merges default headers into request', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}));
    const connector = makeConnector({
      defaultHeaders: { 'X-App-ID': 'my-app', 'Accept': 'application/json' },
    });
    const client = new RESTClient(connector, mockSecrets);
    await client.execute('req-get', { userId: '1' });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-App-ID']).toBe('my-app');
    expect(headers['Accept']).toBe('application/json');
  });
});

describe('Result shape', () => {
  it('returns status, body, and mapped fields', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ data: { name: 'Carol' } }, 200));
    const client = new RESTClient(makeConnector(), mockSecrets);
    const result = await client.execute('req-get', { userId: '3' });
    expect(result).toMatchObject({
      status: 200,
      body: { data: { name: 'Carol' } },
      mapped: { userName: 'Carol' },
    });
  });
});
