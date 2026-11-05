/**
 * ConnectorRunner — executes a named ConnectorRequest from a ConnectorDef.
 *
 * Security:
 *   - Decrypts secrets before injection (secrets never appear in logs)
 *   - SSRF guard: blocks all private/loopback/link-local IP ranges
 *   - Only HTTPS allowed for external requests
 */

import dns from 'dns/promises';
import Handlebars from 'handlebars';
import type { ConnectorDef, ConnectorRequest } from '@/platform/contracts';
import { getSecretValue } from './secrets/store';

// ─── Errors ────────────────────────────────────────────────────────────────────

export class SsrfBlockedError extends Error {
  constructor(url: string, reason: string) {
    super(`SSRF blocked: ${reason} (url: ${url})`);
    this.name = 'SsrfBlockedError';
  }
}

export class ConnectorNotFoundError extends Error {
  constructor(connectorId: string) {
    super(`ConnectorDef not found: ${connectorId}`);
    this.name = 'ConnectorNotFoundError';
  }
}

export class RequestNotFoundError extends Error {
  constructor(requestName: string) {
    super(`ConnectorRequest not found: ${requestName}`);
    this.name = 'RequestNotFoundError';
  }
}

// ─── SSRF guard ────────────────────────────────────────────────────────────────

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

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

async function assertSsrfSafe(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfBlockedError(url, 'invalid URL');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known dangerous hostnames outright
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfBlockedError(url, `hostname "${hostname}" is blocked`);
  }

  // Resolve the hostname to IPs and check each
  let addresses: string[];
  try {
    const result = await dns.lookup(hostname, { all: true });
    addresses = result.map((r) => r.address);
  } catch {
    // If DNS fails, block the request (fail-closed)
    throw new SsrfBlockedError(url, `DNS resolution failed for "${hostname}"`);
  }

  for (const ip of addresses) {
    if (isPrivateIp(ip)) {
      throw new SsrfBlockedError(url, `resolved to private IP ${ip}`);
    }
  }
}

// ─── Runner ────────────────────────────────────────────────────────────────────

export interface RunConnectorRequestParams {
  connectorDef: ConnectorDef;
  requestName: string;
  inputParams: Record<string, unknown>;
}

export async function runConnectorRequest(
  params: RunConnectorRequestParams
): Promise<unknown> {
  const { connectorDef, requestName, inputParams } = params;

  // Find the named request
  const request: ConnectorRequest | undefined = connectorDef.requests?.find(
    (r) => r.name === requestName
  );
  if (!request) {
    throw new RequestNotFoundError(requestName);
  }

  // Decrypt all secrets
  const decryptedSecrets: Record<string, string> = {};
  for (const [key, ref] of Object.entries(connectorDef.secrets)) {
    decryptedSecrets[key] = await getSecretValue(ref);
  }

  // Build the template context (inputParams + decrypted secrets)
  const templateCtx = {
    ...inputParams,
    _secrets: decryptedSecrets,
  };

  // Render path template
  const baseUrl = connectorDef.baseUrl ?? '';
  const rawPath = request.path ?? '';
  const renderedPath = Handlebars.compile(rawPath)(templateCtx);
  const fullUrl = `${baseUrl}${renderedPath}`;

  // SSRF guard — check URL before making any network call
  await assertSsrfSafe(fullUrl);

  // Build request headers (connector defaults + request-level headers, with secrets injected)
  const headers: Record<string, string> = {
    ...(connectorDef.defaultHeaders ?? {}),
    ...(request.headers ?? {}),
  };

  // Render header values through Handlebars (allows {{ _secrets.apiKey }})
  for (const [key, value] of Object.entries(headers)) {
    headers[key] = Handlebars.compile(value)(templateCtx);
  }

  // Render body template
  let body: string | undefined;
  if (request.bodyTemplate) {
    body = Handlebars.compile(request.bodyTemplate)(templateCtx);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const method = request.method ?? 'GET';
  const timeoutMs = (connectorDef.timeoutSeconds ?? 30) * 1000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      method,
      headers,
      body: body ?? undefined,
      redirect: 'error',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Connector request failed: ${response.status} ${text}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  let responseData: unknown;

  if (contentType.includes('application/json')) {
    responseData = await response.json();
  } else {
    responseData = await response.text();
  }

  // Apply output mapping
  if (request.outputMapping && typeof responseData === 'object' && responseData !== null) {
    const mapped: Record<string, unknown> = {};
    for (const [jsonPath, fieldName] of Object.entries(request.outputMapping)) {
      mapped[fieldName] = getByPath(responseData as Record<string, unknown>, jsonPath);
    }
    return mapped;
  }

  return responseData;
}

/** Simple dot-path accessor: "user.name" → obj.user.name */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}
