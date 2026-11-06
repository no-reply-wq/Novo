import dns from 'dns/promises';
import type { RESTConnector, RESTRequest, RESTExecuteResult } from './types';

const PRIVATE_RANGES: RegExp[] = [/^127\./,/^10\./,/^172\.(1[6-9]|2\d|3[01])\./,/^192\.168\./,/^169\.254\./,/^::1$/,/^fc[0-9a-f]{2}:/i,/^fe80:/i,/^0\./,/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

export class SsrfBlockedError extends Error {
  constructor(url: string, reason: string) {
    super('SSRF blocked: ' + reason + ' (url: ' + url + ')');
    this.name = 'SsrfBlockedError';
  }
}
export class RequestNotFoundError extends Error {
  constructor(requestId: string) {
    super('REST request "' + requestId + '" not found in connector');
    this.name = 'RequestNotFoundError';
  }
}

async function assertSsrfSafe(url: string): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new SsrfBlockedError(url, 'invalid URL'); }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) throw new SsrfBlockedError(url, 'hostname "' + hostname + '" is blocked');
  let addresses: string[];
  try {
    const result = await dns.lookup(hostname, { all: true });
    addresses = result.map((r: { address: string; family: number }) => r.address);
  } catch { throw new SsrfBlockedError(url, 'DNS resolution failed for "' + hostname + '"'); }
  for (const ip of addresses) {
    if (PRIVATE_RANGES.some((r) => r.test(ip))) throw new SsrfBlockedError(url, 'resolved to private IP ' + ip);
  }
}

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{([^{}]+?)\}\}/g, (_match, key: string) => {
    const val = vars[key.trim()];
    if (val === null || val === undefined) return '';
    return String(val);
  });
}

function extractJsonPath(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && acc !== undefined && typeof acc === 'object' && key in (acc as Record<string, unknown>))
      return (acc as Record<string, unknown>)[key];
    return undefined;
  }, data);
}

function applyResponseMapping(data: unknown, mapping: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [jsonPath, outputField] of Object.entries(mapping)) {
    result[outputField] = extractJsonPath(data, jsonPath);
  }
  return result;
}

export class RESTClient {
  constructor(private connector: RESTConnector, private secretsGetter: (key: string) => Promise<string>) {}

  async execute(requestId: string, params: Record<string, unknown>): Promise<RESTExecuteResult> {
    const request: RESTRequest | undefined = this.connector.requests.find((r) => r.id === requestId);
    if (!request) throw new RequestNotFoundError(requestId);

    const renderedPath = interpolate(request.path, params);
    const base = this.connector.baseUrl.replace(/\/$/, '');
    let fullUrl = base + renderedPath;

    if (request.queryParams && Object.keys(request.queryParams).length > 0) {
      const qs = new URLSearchParams();
      for (const [key, val] of Object.entries(request.queryParams)) qs.set(key, interpolate(val, params));
      fullUrl = fullUrl + '?' + qs.toString();
    }

    await assertSsrfSafe(fullUrl);
    const authHeaders = await this.buildAuthHeaders();
    const rawHeaders: Record<string, string> = { ...this.connector.defaultHeaders, ...authHeaders, ...(request.headers ?? {}) };
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) headers[k] = interpolate(v, params);

    let body: string | undefined;
    if (request.bodyTemplate) {
      body = interpolate(request.bodyTemplate, params);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(fullUrl, { method: request.method, headers, body, redirect: 'error' });
    const contentType = response.headers.get('content-type') ?? '';
    let responseBody: unknown;
    if (contentType.includes('application/json')) responseBody = await response.json();
    else responseBody = await response.text();

    const mapped = request.responseMapping && typeof responseBody === 'object' && responseBody !== null
      ? applyResponseMapping(responseBody, request.responseMapping) : {};

    return { status: response.status, body: responseBody, mapped };
  }

  private async buildAuthHeaders(): Promise<Record<string, string>> {
    const auth = this.connector.authConfig;
    switch (auth.type) {
      case 'none': return {};
      case 'api_key': { const key = await this.secretsGetter(auth.keyRef); return { [auth.headerName]: key }; }
      case 'bearer': { const token = await this.secretsGetter(auth.tokenRef); return { Authorization: 'Bearer ' + token }; }
      case 'basic': { const pw = await this.secretsGetter(auth.passwordRef); return { Authorization: 'Basic ' + Buffer.from(auth.username + ':' + pw).toString('base64') }; }
      case 'oauth2': {
        const cs = await this.secretsGetter(auth.clientSecretRef);
        const tokenRes = await fetch(auth.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: auth.clientId, client_secret: cs, scope: auth.scopes.join(' ') }).toString() });
        const td = (await tokenRes.json()) as { access_token?: string };
        return { Authorization: 'Bearer ' + (td.access_token ?? '') };
      }
    }
  }
}
