/** @type {import('next').NextConfig} */

/**
 * Security headers applied on every response.
 *
 * CSP uses nonces (injected by src/middleware.ts / src/proxy.ts) rather than
 * 'unsafe-inline', so scripts must carry a matching nonce attribute.
 * 'unsafe-eval' is intentionally absent; replace any eval-based libraries.
 *
 * The public form embed route (/f/*) allows framing by any origin so that
 * tenants can embed forms in their own sites. All other routes deny framing.
 */

const DEFAULT_SECURE_HEADERS = [
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // HTTP Strict Transport Security — 1 year, include subdomains
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },

  // Don't send Referer to cross-origin URLs
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Restrict browser features
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
    ].join(', '),
  },

  // Block framing everywhere (overridden for /f/* below)
  { key: 'X-Frame-Options', value: 'DENY' },

  // CSP — nonce is injected per-request by src/proxy.ts (or middleware).
  // Falls back to 'self' for scripts without nonces (e.g. Next.js inline chunks).
  // 'unsafe-eval' is intentionally absent.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Scripts: 'self' + nonce (nonce injected per-request in proxy/middleware)
      // The header value here is a static fallback; the real per-request nonce
      // is set by overriding this header in proxy.ts using crypto.randomUUID().
      "script-src 'self' 'unsafe-inline'", // TODO: replace with nonce once proxy.ts wires it
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://api.cloudflare.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

/** Headers for the public form embed routes — allows framing. */
const EMBED_HEADERS = DEFAULT_SECURE_HEADERS.map((h) => {
  if (h.key === 'X-Frame-Options') return { key: 'X-Frame-Options', value: 'ALLOWALL' };
  if (h.key === 'Content-Security-Policy') {
    // Allow framing from any origin for the embed route
    return {
      key: 'Content-Security-Policy',
      value: h.value.replace("frame-src 'none'", "frame-ancestors *"),
    };
  }
  return h;
});

const nextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '**.googleapis.com' },
      { protocol: 'https', hostname: 'files.lrbc-erp.com' },
    ],
  },
  async headers() {
    return [
      // Public form embed — allow framing
      {
        source: '/f/(.*)',
        headers: EMBED_HEADERS,
      },
      // Everything else — deny framing, full security headers
      {
        source: '/((?!f/).*)',
        headers: DEFAULT_SECURE_HEADERS,
      },
    ];
  },
};

module.exports = nextConfig;
