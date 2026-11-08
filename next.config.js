/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development';

const PROD_SECURE_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()', 'microphone=()', 'geolocation=()', 'payment=()',
      'usb=()', 'magnetometer=()', 'gyroscope=()', 'accelerometer=()',
    ].join(', '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
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

// In development: no CSP at all — React/Turbopack need eval() and inline scripts freely
const DEV_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];

const DEFAULT_SECURE_HEADERS = isDev ? DEV_HEADERS : PROD_SECURE_HEADERS;

const EMBED_HEADERS = PROD_SECURE_HEADERS.map((h) => {
  if (h.key === 'X-Frame-Options') return { key: 'X-Frame-Options', value: 'ALLOWALL' };
  if (h.key === 'Content-Security-Policy') {
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
      {
        source: '/f/(.*)',
        headers: isDev ? DEV_HEADERS : EMBED_HEADERS,
      },
      {
        source: '/sw.js',
        headers: [{ key: 'Service-Worker-Allowed', value: '/' }],
      },
      {
        source: '/((?!f/).*)',
        headers: DEFAULT_SECURE_HEADERS,
      },
    ];
  },
};

module.exports = nextConfig;
