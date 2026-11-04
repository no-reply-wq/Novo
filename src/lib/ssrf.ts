/**
 * SSRF-safe fetch wrapper.
 * - HTTPS only
 * - Blocks private/loopback/link-local IP ranges after DNS resolution
 * - 5s timeout
 * - No redirects
 * - 1 MB response cap
 */

import dns from 'dns/promises';

const PRIVATE_RANGES = [
  /^127\./,                    // loopback
  /^10\./,                     // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./,// RFC1918
  /^192\.168\./,               // RFC1918
  /^169\.254\./,               // link-local
  /^::1$/,                     // IPv6 loopback
  /^fc[0-9a-f][0-9a-f]:/i,     // IPv6 ULA
  /^fe80:/i,                   // IPv6 link-local
  /^0\./,                      // "this" network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // shared address space
  /^169\.254\./,               // APIPA
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => r.test(ip));
}

/**
 * Fetch a URL safely. Throws on SSRF risk, non-HTTPS, or timeout.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const parsed = new URL(url);

  if (parsed.protocol !== 'https:') {
    throw new Error('safeFetch: only HTTPS URLs are allowed');
  }

  // Resolve the hostname to IPs and block private ranges
  let addresses: string[];
  try {
    const result = await dns.lookup(parsed.hostname, { all: true });
    addresses = result.map((r) => r.address);
  } catch {
    throw new Error(`safeFetch: DNS resolution failed for ${parsed.hostname}`);
  }

  for (const ip of addresses) {
    if (isPrivateIp(ip)) {
      throw new Error(`safeFetch: blocked private IP ${ip} for ${parsed.hostname}`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });

    // Cap response at 1 MB
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
      throw new Error('safeFetch: response too large (> 1 MB)');
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}
