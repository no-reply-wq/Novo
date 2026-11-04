import { safeFetch } from '../ssrf';

// Mock dns to control what IPs resolve to
jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

import dns from 'dns/promises';
const mockLookup = dns.lookup as jest.Mock;

// Mock global fetch so no real HTTP is made
global.fetch = jest.fn();

describe('safeFetch SSRF guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks http:// (non-HTTPS) URLs', async () => {
    await expect(safeFetch('http://example.com/webhook')).rejects.toThrow(
      'only HTTPS URLs are allowed'
    );
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('blocks http://169.254.169.254 (AWS metadata endpoint)', async () => {
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      'only HTTPS URLs are allowed'
    );
  });

  it('blocks https://169.254.169.254 (link-local metadata via DNS)', async () => {
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(
      safeFetch('https://metadata.internal/latest/meta-data/')
    ).rejects.toThrow('blocked private IP 169.254.169.254');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('blocks http://localhost (loopback)', async () => {
    await expect(safeFetch('http://localhost/admin')).rejects.toThrow(
      'only HTTPS URLs are allowed'
    );
  });

  it('blocks https://localhost when DNS resolves to 127.0.0.1', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(safeFetch('https://localhost/admin')).rejects.toThrow(
      'blocked private IP 127.0.0.1'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('blocks 10.x.x.x (RFC1918)', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
    await expect(safeFetch('https://internal.corp/api')).rejects.toThrow(
      'blocked private IP 10.0.0.1'
    );
  });

  it('blocks 172.16.x.x (RFC1918)', async () => {
    mockLookup.mockResolvedValue([{ address: '172.16.5.10', family: 4 }]);
    await expect(safeFetch('https://internal.corp/api')).rejects.toThrow(
      'blocked private IP 172.16.5.10'
    );
  });

  it('blocks 192.168.x.x (RFC1918)', async () => {
    mockLookup.mockResolvedValue([{ address: '192.168.1.1', family: 4 }]);
    await expect(safeFetch('https://router.local/')).rejects.toThrow(
      'blocked private IP 192.168.1.1'
    );
  });

  it('blocks ::1 (IPv6 loopback)', async () => {
    mockLookup.mockResolvedValue([{ address: '::1', family: 6 }]);
    await expect(safeFetch('https://localhost/')).rejects.toThrow(
      'blocked private IP ::1'
    );
  });

  it('blocks fc00::/7 (IPv6 ULA)', async () => {
    mockLookup.mockResolvedValue([{ address: 'fc00::1', family: 6 }]);
    await expect(safeFetch('https://ula.corp/')).rejects.toThrow(
      'blocked private IP fc00::1'
    );
  });

  it('blocks if ANY resolved IP is private (even if others are public)', async () => {
    mockLookup.mockResolvedValue([
      { address: '1.2.3.4', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(safeFetch('https://tricky.example.com/')).rejects.toThrow(
      'blocked private IP 127.0.0.1'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('allows a legitimate public HTTPS URL', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fakeResponse = {
      headers: { get: () => null },
      status: 200,
      ok: true,
    } as unknown as Response;
    (global.fetch as jest.Mock).mockResolvedValue(fakeResponse);

    const res = await safeFetch('https://example.com/webhook');
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({ redirect: 'error' })
    );
  });

  it('throws when DNS resolution fails', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(safeFetch('https://nonexistent.invalid/')).rejects.toThrow(
      'DNS resolution failed'
    );
  });

  it('rejects responses larger than 1 MB', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const bigResponse = {
      headers: { get: (h: string) => (h === 'content-length' ? String(2 * 1024 * 1024) : null) },
    } as unknown as Response;
    (global.fetch as jest.Mock).mockResolvedValue(bigResponse);

    await expect(safeFetch('https://example.com/huge')).rejects.toThrow(
      'response too large'
    );
  });
});
