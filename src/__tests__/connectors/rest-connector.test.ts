/**
 * REST Connector tests — mock fetch, test all auth types, SSRF guard.
 */

import { executeRestRequest, RestConnectorDef } from '../../platform/connectors/rest-connector';
import { SsrfBlockedError } from '../../platform/connectors/ssrf-guard';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeJsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

const baseConnector: RestConnectorDef = {
  id: 'conn-1',
  appId: 'app-1',
  name: 'Test API',
  baseUrl: 'https://api.example.com',
  auth: { type: 'none' },
  defaultHeaders: {},
  requests: [
    {
      id: 'req-get',
      name: 'Get Items',
      method: 'GET',
      path: '/items/{{id}}',
    },
    {
      id: 'req-post',
      name: 'Create Item',
      method: 'POST',
      path: '/items',
      body: { name: '{{name}}', qty: '{{qty}}' },
    },
    {
      id: 'req-path',
      name: 'Get with response path',
      method: 'GET',
      path: '/data',
      responsePath: 'data.items',
    },
  ],
};

const secretGetter = async (name: string) => `secret-${name}`;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('executeRestRequest — no auth', () => {
  it('interpolates variables in URL path', async () => {
    mockFetch.mockReturnValue(makeJsonResponse({ id: '42' }));
    await executeRestRequest(baseConnector, 'req-get', { id: '42' }, secretGetter);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/items/42',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('interpolates body variables', async () => {
    mockFetch.mockReturnValue(makeJsonResponse({ created: true }));
    await executeRestRequest(baseConnector, 'req-post', { name: 'Widget', qty: '5' }, secretGetter);
    const call = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(call[1].body as string);
    expect(sentBody).toEqual({ name: 'Widget', qty: '5' });
  });

  it('extracts response path', async () => {
    mockFetch.mockReturnValue(makeJsonResponse({ data: { items: [1, 2, 3] } }));
    const result = await executeRestRequest(baseConnector, 'req-path', {}, secretGetter);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe('executeRestRequest — auth types', () => {
  it('injects api_key header', async () => {
    mockFetch.mockReturnValue(makeJsonResponse({}));
    const conn: RestConnectorDef = {
      ...baseConnector,
      auth: { type: 'api_key', headerName: 'X-API-Key', valueSecret: 'mySecret' },
    };
    await executeRestRequest(conn, 'req-get', { id: '1' }, secretGetter);
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('secret-mySecret');
  });

  it('injects bearer token', async () => {
    mockFetch.mockReturnValue(makeJsonResponse({}));
    const conn: RestConnectorDef = {
      ...baseConnector,
      auth: { type: 'bearer', tokenSecret: 'bearerSecret' },
    };
    await executeRestRequest(conn, 'req-get', { id: '1' }, secretGetter);
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer secret-bearerSecret');
  });

  it('injects basic auth', async () => {
    mockFetch.mockReturnValue(makeJsonResponse({}));
    const conn: RestConnectorDef = {
      ...baseConnector,
      auth: { type: 'basic', userSecret: 'userSec', passSecret: 'passSec' },
    };
    await executeRestRequest(conn, 'req-get', { id: '1' }, secretGetter);
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    const expected = 'Basic ' + Buffer.from('secret-userSec:secret-passSec').toString('base64');
    expect(headers['Authorization']).toBe(expected);
  });

  it('injects oauth2 bearer token', async () => {
    // First call: token endpoint, second call: actual API
    mockFetch
      .mockReturnValueOnce(makeJsonResponse({ access_token: 'tok-xyz', expires_in: 3600 }))
      .mockReturnValueOnce(makeJsonResponse({ ok: true }));

    const conn: RestConnectorDef = {
      ...baseConnector,
      id: 'conn-oauth2-unique',
      auth: {
        type: 'oauth2',
        tokenUrl: 'https://auth.example.com/token',
        clientIdSecret: 'clientId',
        clientSecretSecret: 'clientSecret',
        scope: 'read write',
      },
    };
    await executeRestRequest(conn, 'req-get', { id: '1' }, secretGetter);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const apiHeaders = mockFetch.mock.calls[1][1].headers as Record<string, string>;
    expect(apiHeaders['Authorization']).toBe('Bearer tok-xyz');
  });
});

describe('executeRestRequest — SSRF guard', () => {
  it('blocks requests to private IPs', async () => {
    const conn: RestConnectorDef = {
      ...baseConnector,
      baseUrl: 'http://192.168.1.1',
    };
    await expect(
      executeRestRequest(conn, 'req-get', { id: '1' }, secretGetter),
    ).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks localhost', async () => {
    const conn: RestConnectorDef = {
      ...baseConnector,
      baseUrl: 'http://localhost:3000',
    };
    await expect(
      executeRestRequest(conn, 'req-get', { id: '1' }, secretGetter),
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('throws for unknown request id', async () => {
    await expect(
      executeRestRequest(baseConnector, 'req-nonexistent', {}, secretGetter),
    ).rejects.toThrow('not found');
  });
});
