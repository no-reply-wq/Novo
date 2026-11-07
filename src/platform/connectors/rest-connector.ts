/**
 * REST Connector — generic HTTP connector with auth, variable interpolation,
 * SSRF protection, and OAuth2 token caching.
 */

import { checkSsrf } from './ssrf-guard';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RestConnectorDef {
  id: string;
  appId: string;
  name: string;
  baseUrl: string;
  auth: RestAuth;
  defaultHeaders?: Record<string, string>;
  requests: RestRequest[];
}

export type RestAuth =
  | { type: 'none' }
  | { type: 'api_key'; headerName: string; valueSecret: string }
  | { type: 'bearer'; tokenSecret: string }
  | { type: 'basic'; userSecret: string; passSecret: string }
  | {
      type: 'oauth2';
      tokenUrl: string;
      clientIdSecret: string;
      clientSecretSecret: string;
      scope?: string;
    };

export interface RestRequest {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; // can include {{variables}}
  headers?: Record<string, string>;
  body?: unknown; // JSON body template with {{variables}}
  responsePath?: string; // dot-path to extract from response, e.g. "data.items"
}

// ─── OAuth2 token cache ───────────────────────────────────────────────────────

interface OAuth2Token {
  accessToken: string;
  expiresAt: number; // Date.now() ms
}

/** In-memory per-connector OAuth2 token cache */
const oauth2Cache = new Map<string, OAuth2Token>();

async function getOAuth2Token(
  connectorId: string,
  auth: Extract<RestAuth, { type: 'oauth2' }>,
  secretGetter: (name: string) => Promise<string>,
): Promise<string> {
  const cached = oauth2Cache.get(connectorId);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const clientId = await secretGetter(auth.clientIdSecret);
  const clientSecret = await secretGetter(auth.clientSecretSecret);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    ...(auth.scope ? { scope: auth.scope } : {}),
  });

  checkSsrf(auth.tokenUrl);

  const res = await fetch(auth.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`OAuth2 token request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresIn = data.expires_in ?? 3600;

  const token: OAuth2Token = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  oauth2Cache.set(connectorId, token);
  return token.accessToken;
}

// ─── Variable interpolation ───────────────────────────────────────────────────

function interpolate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = variables[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

function interpolateObject(obj: unknown, variables: Record<string, unknown>): unknown {
  if (typeof obj === 'string') return interpolate(obj, variables);
  if (Array.isArray(obj)) return obj.map((item) => interpolateObject(item, variables));
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        interpolateObject(v, variables),
      ]),
    );
  }
  return obj;
}

// ─── JSONPath-style dot-path extractor ───────────────────────────────────────

function extractPath(data: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeRestRequest(
  connector: RestConnectorDef,
  requestId: string,
  variables: Record<string, unknown>,
  secretGetter: (name: string) => Promise<string>,
): Promise<unknown> {
  const requestDef = connector.requests.find((r) => r.id === requestId);
  if (!requestDef) {
    throw new Error(`Request "${requestId}" not found in connector "${connector.id}"`);
  }

  // Build URL
  const interpolatedPath = interpolate(requestDef.path, variables);
  const baseUrl = connector.baseUrl.replace(/\/$/, '');
  const fullUrl = `${baseUrl}${interpolatedPath}`;

  // SSRF guard
  checkSsrf(fullUrl);

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(connector.defaultHeaders ?? {}),
    ...(requestDef.headers ? (interpolateObject(requestDef.headers, variables) as Record<string, string>) : {}),
  };

  // Apply auth
  const { auth } = connector;
  if (auth.type === 'api_key') {
    headers[auth.headerName] = await secretGetter(auth.valueSecret);
  } else if (auth.type === 'bearer') {
    headers['Authorization'] = `Bearer ${await secretGetter(auth.tokenSecret)}`;
  } else if (auth.type === 'basic') {
    const user = await secretGetter(auth.userSecret);
    const pass = await secretGetter(auth.passSecret);
    headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  } else if (auth.type === 'oauth2') {
    const token = await getOAuth2Token(connector.id, auth, secretGetter);
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Build body
  let body: string | undefined;
  if (requestDef.body !== undefined && !['GET', 'DELETE'].includes(requestDef.method)) {
    body = JSON.stringify(interpolateObject(requestDef.body, variables));
  }

  // Execute request
  const res = await fetch(fullUrl, {
    method: requestDef.method,
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`REST request failed: ${res.status} ${res.statusText} — ${text}`);
  }

  const responseData: unknown = await res.json();

  // Extract path if specified
  if (requestDef.responsePath) {
    return extractPath(responseData, requestDef.responsePath);
  }

  return responseData;
}
