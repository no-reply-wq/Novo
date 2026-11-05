/**
 * REST connector — executes named request templates from a tenant's rest integration config.
 *
 * Config shape (stored in platform.integration_configs with type='rest'):
 *   baseUrl: string
 *   auth: { type: 'none'|'api_key'|'bearer'|'basic'|'oauth2', ... }
 *   requests: Array<{ name, method, path, headers?, bodyTemplate?, responseMapping? }>
 *
 * Security:
 *   - SSRF guard: re-uses the assertSsrfSafe logic from runner.ts
 *   - Only credentials in the integration config are used (no tenant-script injection)
 */

import dns from 'dns/promises';
import { pgPool } from '@/lib/db/client';
import { decryptSecret } from '../secrets';
import { NotConfiguredError } from '../secrets/manager';

// ─── Types ─────────────────────────────────────────────────────────────────────

type AuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';

interface AuthConfig {
  type: AuthType;
  /** api_key: header name, e.g. "X-API-Key" */
  headerName?: string;
  /** api_key: encrypted key value */
  apiKey?: string;
  /** bearer: encrypted token */
  token?: string;
  /** basic: encrypted credentials as "user:password" */
  credentials?: string;
  /** oauth2: encrypted access token */
  accessToken?: string;
}

interface RequestTemplate {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  responseMapping?: Record<string, string>;
}

interface RestConnectorConfig {
  baseUrl: string;
  auth: AuthConfig;
  requests: RequestTemplate[];
}

// ─── Errors ────────────────────────────────────────────────────────────────────

export class SsrfBlockedError extends Error {
  constructor(url: string, reason: string) {
    super(`SSRF blocked: ${reason} (url: ${url})`);
    this.name = 'SsrfBlockedError';
  }
}

export class ConnectorRequestNotFoundError extends Error {
  constructor(requestName: string, connectorId: string) {
    super(`Request "${requestName}" not found in connector "${connectorId}"`);
    this.name = 'ConnectorRequestNotFoundError';
  }
}

// ─── SSRF guard ─────────────────────────────────────────────────────────────────

const PRIVATE_RANGES: RegExp[] = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

async function assertSsrfSafe(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfBlockedError(url, 'invalid URL');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfBlockedError(url, `hostname "${hostname}" is blocked`);
  }

  let addresses: string[];
  try {
    const result = await dns.lookup(hostname, { all: true });
    addresses = result.map((r: { address: string; family: number }) => r.address);
  } catch {
    throw new SsrfBlockedError(url, `DNS resolution failed for "${hostname}"`);
  }

  for (const ip of addresses) {
    if (PRIVATE_RANGES.some((r) => r.test(ip))) {
      throw new SsrfBlockedError(url, `resolved to private IP ${ip}`);
    }
  }
}

// ─── Template interpolation ────────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{([^{}]+?)\}\}/g, (_match, key: string) => {
    const val = vars[key.trim()];
    if (val === null || val === undefined) return '';
    return String(val);
  });
}

// ─── Auth header resolution ────────────────────────────────────────────────────

function resolveAuthHeaders(
  auth: AuthConfig,
  tenantSlug: string
): Record<string, string> {
  switch (auth.type) {
    case 'none':
      return {};

    case 'api_key': {
      if (!auth.headerName || !auth.apiKey) return {};
      const decrypted = decryptSecret(auth.apiKey, tenantSlug);
      return { [auth.headerName]: decrypted };
    }

    case 'bearer': {
      if (!auth.token) return {};
      const decrypted = decryptSecret(auth.token, tenantSlug);
      return { Authorization: `Bearer ${decrypted}` };
    }

    case 'basic': {
      if (!auth.credentials) return {};
      const decrypted = decryptSecret(auth.credentials, tenantSlug);
      const encoded = Buffer.from(decrypted).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }

    case 'oauth2': {
      if (!auth.accessToken) return {};
      const decrypted = decryptSecret(auth.accessToken, tenantSlug);
      return { Authorization: `Bearer ${decrypted}` };
    }
  }
}

// ─── Response mapping ──────────────────────────────────────────────────────────

function applyResponseMapping(
  data: Record<string, unknown>,
  mapping: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [jsonPath, outputKey] of Object.entries(mapping)) {
    result[outputKey] = jsonPath.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, data);
  }
  return result;
}

// ─── Main executor ─────────────────────────────────────────────────────────────

export interface ExecuteRestRequestParams {
  tenantSlug: string;
  connectorId: string;
  requestName: string;
  variables: Record<string, unknown>;
}

/**
 * Load a REST connector config from platform.integration_configs.
 */
async function loadRestConfig(
  tenantSlug: string,
  connectorId: string
): Promise<RestConnectorConfig> {
  const result = await pgPool.query<{ config: Record<string, string> }>(
    `SELECT config FROM platform.integration_configs
     WHERE id = $1 AND tenant_slug = $2 AND type = 'rest' AND enabled = true`,
    [connectorId, tenantSlug]
  );

  if (result.rows.length === 0) {
    throw new NotConfiguredError(
      `No enabled rest integration found with id "${connectorId}" for tenant: ${tenantSlug}`
    );
  }

  const raw = result.rows[0].config;
  if (!raw['baseUrl']) {
    throw new NotConfiguredError(
      `REST integration "${connectorId}" is missing baseUrl`
    );
  }

  let auth: AuthConfig = { type: 'none' };
  if (raw['auth']) {
    try {
      auth = JSON.parse(raw['auth']) as AuthConfig;
    } catch {
      throw new Error(`REST integration "${connectorId}" has invalid auth JSON`);
    }
  }

  let requests: RequestTemplate[] = [];
  if (raw['requests']) {
    try {
      requests = JSON.parse(raw['requests']) as RequestTemplate[];
    } catch {
      throw new Error(`REST integration "${connectorId}" has invalid requests JSON`);
    }
  }

  return { baseUrl: raw['baseUrl'], auth, requests };
}

/**
 * Execute a named REST request template from a tenant's connector config.
 */
export async function executeRestRequest(
  params: ExecuteRestRequestParams
): Promise<unknown> {
  const { tenantSlug, connectorId, requestName, variables } = params;

  const cfg = await loadRestConfig(tenantSlug, connectorId);

  const request = cfg.requests.find((r) => r.name === requestName);
  if (!request) {
    throw new ConnectorRequestNotFoundError(requestName, connectorId);
  }

  // Build the full URL
  const renderedPath = interpolate(request.path, variables);
  const fullUrl = `${cfg.baseUrl.replace(/\/$/, '')}${renderedPath}`;

  // SSRF guard before any network call
  await assertSsrfSafe(fullUrl);

  // Build headers: auth + request-level + variable interpolation
  const authHeaders = resolveAuthHeaders(cfg.auth, tenantSlug);
  const rawHeaders: Record<string, string> = {
    ...authHeaders,
    ...(request.headers ?? {}),
  };

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    headers[k] = interpolate(v, variables);
  }

  // Build body
  let body: string | undefined;
  if (request.bodyTemplate) {
    body = interpolate(request.bodyTemplate, variables);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(fullUrl, {
    method: request.method ?? 'GET',
    headers,
    body,
    redirect: 'error',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`REST request failed: ${response.status} ${text}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  let data: unknown;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  // Apply response mapping if configured
  if (
    request.responseMapping &&
    typeof data === 'object' &&
    data !== null
  ) {
    return applyResponseMapping(data as Record<string, unknown>, request.responseMapping);
  }

  return data;
}
