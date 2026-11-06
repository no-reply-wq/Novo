import { RESTClient, SsrfBlockedError, RequestNotFoundError } from '../client'
import type { RESTConnector } from '../types'

const noop = async (_k: string) => ''

function makeConnector(overrides: Partial<RESTConnector> = {}): RESTConnector {
  return {
    id: 'conn1',
    appId: 'app1',
    name: 'Test',
    baseUrl: 'https://api.example.com',
    auth: { type: 'none' },
    requests: [
      {
        id: 'req1',
        name: 'Get user',
        method: 'GET',
        path: '/users/{{userId}}',
        responseMapping: { '$.data.id': 'userId', '$.data.name': 'userName' },
      },
    ],
    ...overrides,
  }
}

describe('RESTClient', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ data: { id: 'u1', name: 'Alice' } }),
    } as unknown as Response)
    global.fetch = fetchMock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('URL assembly', () => {
    it('interpolates path params', async () => {
      const client = new RESTClient(makeConnector(), noop)
      await client.execute('req1', { userId: '42' })
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/users/42',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('appends query params', async () => {
      const connector = makeConnector({
        requests: [
          {
            id: 'req1',
            name: 'Search',
            method: 'GET',
            path: '/search',
            params: [{ name: 'q', in: 'query', value: '{{query}}' }],
          },
        ],
      })
      const client = new RESTClient(connector, noop)
      await client.execute('req1', { query: 'hello world' })
      const url = fetchMock.mock.calls[0]?.[0] as string
      expect(url).toContain('q=hello+world')
    })
  })

  describe('Authentication', () => {
    it('adds bearer token header', async () => {
      const connector = makeConnector({ auth: { type: 'bearer', tokenRef: 'MY_TOKEN' } })
      const secrets = async (k: string) => (k === 'MY_TOKEN' ? 'secret123' : '')
      const client = new RESTClient(connector, secrets)
      await client.execute('req1', { userId: '1' })
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer secret123')
    })

    it('adds api_key to header', async () => {
      const connector = makeConnector({
        auth: { type: 'api_key', keyIn: 'header', keyName: 'X-Api-Key', keyRef: 'API_KEY' },
      })
      const secrets = async (k: string) => (k === 'API_KEY' ? 'mykey' : '')
      const client = new RESTClient(connector, secrets)
      await client.execute('req1', { userId: '1' })
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers['X-Api-Key']).toBe('mykey')
    })

    it('adds api_key to query string', async () => {
      const connector = makeConnector({
        auth: { type: 'api_key', keyIn: 'query', keyName: 'token', keyRef: 'API_TOKEN' },
        requests: [{ id: 'req1', name: 'x', method: 'GET', path: '/data' }],
      })
      const secrets = async (k: string) => (k === 'API_TOKEN' ? 'qtoken' : '')
      const client = new RESTClient(connector, secrets)
      await client.execute('req1', {})
      const url = fetchMock.mock.calls[0]?.[0] as string
      expect(url).toContain('token=qtoken')
    })

    it('adds basic auth header', async () => {
      const connector = makeConnector({
        auth: { type: 'basic', username: 'admin', passwordRef: 'PASS' },
      })
      const secrets = async (k: string) => (k === 'PASS' ? 'secret' : '')
      const client = new RESTClient(connector, secrets)
      await client.execute('req1', { userId: '1' })
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      const expected = `Basic ${Buffer.from('admin:secret').toString('base64')}`
      expect(headers['Authorization']).toBe(expected)
    })
  })

  describe('Request body', () => {
    it('interpolates body template', async () => {
      const connector = makeConnector({
        requests: [{
          id: 'req1', name: 'Create', method: 'POST', path: '/items',
          bodyTemplate: '{"name":"{{itemName}}","qty":{{qty}}}',
        }],
      })
      const client = new RESTClient(connector, noop)
      await client.execute('req1', { itemName: 'Widget', qty: 5 })
      const body = fetchMock.mock.calls[0]?.[1]?.body as string
      expect(body).toBe('{"name":"Widget","qty":5}')
    })
  })

  describe('Response mapping', () => {
    it('maps jsonPath to output fields', async () => {
      const client = new RESTClient(makeConnector(), noop)
      const result = await client.execute('req1', { userId: '1' })
      expect(result.mapped['userId']).toBe('u1')
      expect(result.mapped['userName']).toBe('Alice')
    })

    it('returns raw body', async () => {
      const client = new RESTClient(makeConnector(), noop)
      const result = await client.execute('req1', { userId: '1' })
      expect(result.body).toEqual({ data: { id: 'u1', name: 'Alice' } })
    })

    it('returns status code', async () => {
      const client = new RESTClient(makeConnector(), noop)
      const result = await client.execute('req1', { userId: '1' })
      expect(result.status).toBe(200)
    })
  })

  describe('SSRF protection', () => {
    it('blocks localhost', async () => {
      const connector = makeConnector({ baseUrl: 'http://localhost:8080', requests: [{ id: 'req1', name: 'x', method: 'GET', path: '/' }] })
      const client = new RESTClient(connector, noop)
      await expect(client.execute('req1', {})).rejects.toBeInstanceOf(SsrfBlockedError)
    })

    it('blocks 10.x.x.x', async () => {
      const connector = makeConnector({ baseUrl: 'http://10.0.0.1', requests: [{ id: 'req1', name: 'x', method: 'GET', path: '/' }] })
      const client = new RESTClient(connector, noop)
      await expect(client.execute('req1', {})).rejects.toBeInstanceOf(SsrfBlockedError)
    })

    it('blocks 192.168.x.x', async () => {
      const connector = makeConnector({ baseUrl: 'http://192.168.1.1', requests: [{ id: 'req1', name: 'x', method: 'GET', path: '/' }] })
      const client = new RESTClient(connector, noop)
      await expect(client.execute('req1', {})).rejects.toBeInstanceOf(SsrfBlockedError)
    })

    it('blocks metadata.google.internal', async () => {
      const connector = makeConnector({ baseUrl: 'http://metadata.google.internal', requests: [{ id: 'req1', name: 'x', method: 'GET', path: '/' }] })
      const client = new RESTClient(connector, noop)
      await expect(client.execute('req1', {})).rejects.toBeInstanceOf(SsrfBlockedError)
    })
  })

  describe('Error handling', () => {
    it('throws RequestNotFoundError for unknown requestId', async () => {
      const client = new RESTClient(makeConnector(), noop)
      await expect(client.execute('nonexistent', {})).rejects.toBeInstanceOf(RequestNotFoundError)
    })

    it('returns 4xx status in result', async () => {
      fetchMock.mockResolvedValueOnce({
        status: 404,
        json: async () => ({ error: 'not found' }),
      } as unknown as Response)
      const client = new RESTClient(makeConnector(), noop)
      const result = await client.execute('req1', { userId: '99' })
      expect(result.status).toBe(404)
    })
  })

  describe('Default headers', () => {
    it('merges default headers with auth', async () => {
      const connector = makeConnector({
        auth: { type: 'bearer', tokenRef: 'TOK' },
        defaultHeaders: { 'X-App-Id': 'myapp' },
      })
      const secrets = async () => 'token'
      const client = new RESTClient(connector, secrets)
      await client.execute('req1', { userId: '1' })
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(headers['X-App-Id']).toBe('myapp')
      expect(headers['Authorization']).toBe('Bearer token')
    })
  })
})
