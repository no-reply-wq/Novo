/**
 * Tests for ConnectorRunner.
 *
 * Attack test: requests to AWS metadata endpoint (169.254.169.254) must be blocked.
 * Also tests: private IP ranges, localhost, correct HTTP call shape.
 */

import { jest } from '@jest/globals';

// ── Mock DNS ───────────────────────────────────────────────────────────────────
const mockDnsLookup = jest.fn<() => Promise<Array<{ address: string; family: number }>>>();

jest.mock('dns/promises', () => ({
  lookup: mockDnsLookup,
}));

// ── Mock fetch ─────────────────────────────────────────────────────────────────
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

// ── Mock secrets store ─────────────────────────────────────────────────────────
jest.mock('../secrets/store', () => ({
  getSecretValue: jest.fn<() => Promise<string>>().mockResolvedValue('mock-api-key'),
}));

import { runConnectorRequest, SsrfBlockedError, RequestNotFoundError } from '../runner';
import type { ConnectorDef } from '@/platform/contracts';

const baseConnector: ConnectorDef = {
  id: 'conn-1',
  appId: 'app-1',
  name: 'Test API',
  kind: 'http_rest',
  baseUrl: 'https://api.example.com',
  defaultHeaders: { Authorization: 'Bearer {{ _secrets.apiKey }}' },
  secrets: {
    apiKey: { secretId: 'secret-api-key' },
  },
  requests: [
    {
      name: 'get_customer',
      method: 'GET',
      path: '/customers/{{customerId}}',
      outputMapping: { 'data.name': 'customerName' },
    },
    {
      name: 'create_order',
      method: 'POST',
      path: '/orders',
      bodyTemplate: '{"customer_id":"{{customerId}}","amount": {{amount}} }',
    },
  ],
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeJsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
  } as unknown as Response;
}

describe('runConnectorRequest — happy path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: resolve to a public IP
    mockDnsLookup.mockResolvedValue([{ address: '203.0.113.1', family: 4 }]);
  });

  it('makes a GET request to the rendered path', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ data: { name: 'Acme Corp' } }));

    await runConnectorRequest({
      connectorDef: baseConnector,
      requestName: 'get_customer',
      inputParams: { customerId: '42' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/customers/42',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('injects decrypted secret into Authorization header', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ data: { name: 'Test' } }));

    await runConnectorRequest({
      connectorDef: baseConnector,
      requestName: 'get_customer',
      inputParams: { customerId: '1' },
    });

    const callHeaders = (mockFetch.mock.calls[0]?.[1] as RequestInit)
      ?.headers as Record<string, string>;
    expect(callHeaders?.['Authorization']).toBe('Bearer mock-api-key');
  });

  it('applies output mapping', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ data: { name: 'Mapped Corp' } }));

    const result = await runConnectorRequest({
      connectorDef: baseConnector,
      requestName: 'get_customer',
      inputParams: { customerId: '99' },
    }) as Record<string, unknown>;

    expect(result['customerName']).toBe('Mapped Corp');
  });

  it('renders bodyTemplate and sends correct POST body', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: 'order-1' }));

    await runConnectorRequest({
      connectorDef: baseConnector,
      requestName: 'create_order',
      inputParams: { customerId: 'cust-7', amount: 1500 },
    });

    const body = (mockFetch.mock.calls[0]?.[1] as RequestInit)?.body as string;
    const parsed = JSON.parse(body.trim()) as Record<string, unknown>;
    expect(parsed['customer_id']).toBe('cust-7');
    expect(parsed['amount']).toBe(1500);
  });
});

describe('runConnectorRequest — SSRF guard (attack tests)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Primary attack test: AWS metadata endpoint ─────────────────────────────

  it('blocks request to AWS metadata endpoint 169.254.169.254', async () => {
    // DNS resolves to the link-local AWS metadata IP
    mockDnsLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    const metadataConnector: ConnectorDef = {
      ...baseConnector,
      baseUrl: 'http://169.254.169.254',
      requests: [{ name: 'steal', method: 'GET', path: '/latest/meta-data/' }],
    };

    await expect(
      runConnectorRequest({
        connectorDef: metadataConnector,
        requestName: 'steal',
        inputParams: {},
      })
    ).rejects.toThrow(SsrfBlockedError);

    // fetch must NOT have been called
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks requests that resolve to 10.x.x.x (RFC1918)', async () => {
    mockDnsLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);

    const internalConnector: ConnectorDef = {
      ...baseConnector,
      baseUrl: 'https://internal.example.com',
    };

    await expect(
      runConnectorRequest({
        connectorDef: internalConnector,
        requestName: 'get_customer',
        inputParams: { customerId: '1' },
      })
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('blocks requests that resolve to 192.168.x.x', async () => {
    mockDnsLookup.mockResolvedValue([{ address: '192.168.1.100', family: 4 }]);

    await expect(
      runConnectorRequest({
        connectorDef: { ...baseConnector, baseUrl: 'https://router.local' },
        requestName: 'get_customer',
        inputParams: { customerId: '1' },
      })
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('blocks requests to localhost hostname', async () => {
    // localhost is blocked by hostname check before DNS
    mockDnsLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(
      runConnectorRequest({
        connectorDef: { ...baseConnector, baseUrl: 'https://localhost:8080' },
        requestName: 'get_customer',
        inputParams: { customerId: '1' },
      })
    ).rejects.toThrow(SsrfBlockedError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks requests where DNS resolution fails (fail-closed)', async () => {
    mockDnsLookup.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(
      runConnectorRequest({
        connectorDef: { ...baseConnector, baseUrl: 'https://nonexistent.invalid' },
        requestName: 'get_customer',
        inputParams: { customerId: '1' },
      })
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('blocks IPv6 loopback ::1', async () => {
    mockDnsLookup.mockResolvedValue([{ address: '::1', family: 6 }]);

    await expect(
      runConnectorRequest({
        connectorDef: { ...baseConnector, baseUrl: 'https://ipv6-loopback.test' },
        requestName: 'get_customer',
        inputParams: { customerId: '1' },
      })
    ).rejects.toThrow(SsrfBlockedError);
  });
});

describe('runConnectorRequest — error cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: '203.0.113.1', family: 4 }]);
  });

  it('throws RequestNotFoundError for unknown request name', async () => {
    await expect(
      runConnectorRequest({
        connectorDef: baseConnector,
        requestName: 'nonexistent_request',
        inputParams: {},
      })
    ).rejects.toThrow(RequestNotFoundError);
  });

  it('throws when API returns non-OK status', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'Not found' }, false));

    await expect(
      runConnectorRequest({
        connectorDef: baseConnector,
        requestName: 'get_customer',
        inputParams: { customerId: '999' },
      })
    ).rejects.toThrow('400');
  });
});
