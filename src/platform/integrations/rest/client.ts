import dns from 'dns/promises'
import type { RESTConnector, RESTRequest, RESTExecuteResult } from './types'

export class SsrfBlockedError extends Error {
  constructor(host: string) {
    super(`SSRF blocked: ${host} resolves to a private address`)
    this.name = 'SsrfBlockedError'
  }
}

export class RequestNotFoundError extends Error {
  constructor(id: string) {
    super(`REST request not found: ${id}`)
    this.name = 'RequestNotFoundError'
  }
}

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
]

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
  '169.254.169.254',
])

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some(r => r.test(ip))
}

async function guardSsrf(host: string): Promise<void> {
  if (BLOCKED_HOSTNAMES.has(host.toLowerCase())) {
    throw new SsrfBlockedError(host)
  }
  if (isPrivateIp(host)) {
    throw new SsrfBlockedError(host)
  }
  try {
    const addrs = await dns.lookup(host, { all: true })
    for (const { address } of addrs) {
      if (isPrivateIp(address)) {
        throw new SsrfBlockedError(host)
      }
    }
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err
    // DNS failure — let fetch handle it
  }
}

function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.[\]]+)\s*\}\}/g, (_, key: string) => {
    const val = key.split('.').reduce<unknown>((obj, k) => {
      if (obj !== null && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[k]
      }
      return undefined
    }, params as unknown)
    return val !== undefined ? String(val) : ''
  })
}

function getJsonPath(obj: unknown, path: string): unknown {
  // Simple dot-notation JSON path ($.foo.bar or foo.bar)
  const parts = path.replace(/^\$\.?/, '').split('.')
  return parts.reduce<unknown>((cur, part) => {
    if (cur !== null && typeof cur === 'object') {
      return (cur as Record<string, unknown>)[part]
    }
    return undefined
  }, obj)
}

export class RESTClient {
  constructor(
    private readonly connector: RESTConnector,
    private readonly secretsGetter: (key: string) => Promise<string>
  ) {}

  async execute(
    requestId: string,
    params: Record<string, unknown>
  ): Promise<RESTExecuteResult> {
    const req = this.connector.requests.find(r => r.id === requestId)
    if (!req) throw new RequestNotFoundError(requestId)

    const url = await this.buildUrl(req, params)
    const headers = await this.buildHeaders(req, params)
    const body = req.bodyTemplate ? interpolate(req.bodyTemplate, params) : undefined

    const host = new URL(url).hostname
    await guardSsrf(host)

    const fetchRes = await fetch(url, {
      method: req.method,
      headers,
      body,
    })

    const responseBody: unknown = await fetchRes.json().catch(() => null)

    const mapped: Record<string, unknown> = {}
    if (req.responseMapping && responseBody !== null) {
      for (const [jsonPath, outputField] of Object.entries(req.responseMapping)) {
        mapped[outputField] = getJsonPath(responseBody, jsonPath)
      }
    }

    return { status: fetchRes.status, body: responseBody, mapped }
  }

  private async buildUrl(req: RESTRequest, params: Record<string, unknown>): Promise<string> {
    const base = this.connector.baseUrl.replace(/\/$/, '')
    const path = interpolate(req.path, params)
    const url = new URL(base + path)

    const auth = this.connector.auth
    if (auth.type === 'api_key' && auth.keyIn === 'query' && auth.keyName && auth.keyRef) {
      const val = await this.secretsGetter(auth.keyRef)
      url.searchParams.set(auth.keyName, val)
    }

    if (req.params) {
      for (const p of req.params) {
        if (p.in === 'query') {
          url.searchParams.set(p.name, interpolate(p.value, params))
        }
      }
    }

    return url.toString()
  }

  private async buildHeaders(req: RESTRequest, params: Record<string, unknown>): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.connector.defaultHeaders,
    }

    const auth = this.connector.auth
    switch (auth.type) {
      case 'api_key':
        if (auth.keyIn === 'header' && auth.keyName && auth.keyRef) {
          headers[auth.keyName] = await this.secretsGetter(auth.keyRef)
        }
        break
      case 'bearer':
        if (auth.tokenRef) {
          headers['Authorization'] = `Bearer ${await this.secretsGetter(auth.tokenRef)}`
        }
        break
      case 'basic':
        if (auth.username && auth.passwordRef) {
          const pass = await this.secretsGetter(auth.passwordRef)
          headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${pass}`).toString('base64')}`
        }
        break
      default:
        break
    }

    if (req.params) {
      for (const p of req.params) {
        if (p.in === 'header') {
          headers[p.name] = interpolate(p.value, params)
        }
      }
    }

    return headers
  }
}
