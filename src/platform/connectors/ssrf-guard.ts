/**
 * SSRF Guard — blocks requests to private IP ranges, localhost,
 * and cloud metadata endpoints.
 *
 * Call checkSsrf(url) before any outbound HTTP request.
 */

import { URL } from 'url';

/** Ranges that are always blocked */
const BLOCKED_PATTERNS: RegExp[] = [
  // Loopback
  /^127\./,
  /^::1$/,
  /^localhost$/i,
  // Link-local / metadata
  /^169\.254\./,
  /^fe80:/i,
  // RFC-1918 private
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // IPv6 ULA
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  // Cloud metadata
  /^metadata\.google\.internal$/i,
  /^169\.254\.169\.254$/,
];

export class SsrfBlockedError extends Error {
  constructor(url: string) {
    super(`SSRF blocked: request to ${url} is not allowed`);
    this.name = 'SsrfBlockedError';
  }
}

/**
 * Throws SsrfBlockedError if the URL resolves to a private/metadata address.
 * Always call before making an outbound HTTP request.
 */
export function checkSsrf(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(rawUrl);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new SsrfBlockedError(rawUrl);
    }
  }

  // Block non-http(s) schemes
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SsrfBlockedError(rawUrl);
  }
}
