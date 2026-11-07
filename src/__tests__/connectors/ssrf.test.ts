/**
 * SSRF Guard tests — comprehensive check of all private ranges.
 */

import { checkSsrf, SsrfBlockedError } from '../../platform/connectors/ssrf-guard';

describe('checkSsrf', () => {
  const blocked = [
    'http://127.0.0.1/api',
    'http://127.0.0.1:8080/',
    'http://localhost/admin',
    'http://LOCALHOST/admin',
    'http://10.0.0.1/meta',
    'http://10.255.255.255/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.0.1/',
    'http://192.168.255.255/',
    'http://169.254.169.254/latest/meta-data/',
    'http://169.254.0.1/',
    'http://metadata.google.internal/',
    'http://[::1]/api',
  ];

  const allowed = [
    'https://api.stripe.com/v1/charges',
    'https://httpbin.org/get',
    'https://8.8.8.8/dns',
    'https://1.1.1.1/dns-query',
    'https://203.0.113.1/resource',
  ];

  test.each(blocked)('blocks %s', (url) => {
    expect(() => checkSsrf(url)).toThrow(SsrfBlockedError);
  });

  test.each(allowed)('allows %s', (url) => {
    expect(() => checkSsrf(url)).not.toThrow();
  });

  it('blocks non-http schemes', () => {
    expect(() => checkSsrf('ftp://example.com/file')).toThrow(SsrfBlockedError);
    expect(() => checkSsrf('file:///etc/passwd')).toThrow(SsrfBlockedError);
  });

  it('blocks malformed URLs', () => {
    expect(() => checkSsrf('not-a-url')).toThrow(SsrfBlockedError);
  });
});
