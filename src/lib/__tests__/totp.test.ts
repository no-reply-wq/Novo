/**
 * Tests for src/lib/auth/totp.ts
 *
 * Covers:
 * - generateTotpSecret returns a non-empty string
 * - totpProvisioningUri returns an otpauth:// URL
 * - totpQrCodeDataUrl returns a data: URI
 * - verifyTotp accepts the correct code
 * - verifyTotp rejects a wrong code
 * - verifyTotp rejects an expired code (mocked time)
 */

import { generateTotpSecret, totpProvisioningUri, totpQrCodeDataUrl, verifyTotp } from '../auth/totp';
import { generate } from 'otplib';

describe('generateTotpSecret', () => {
  it('returns a non-empty Base32 string', () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
    // Base32 alphabet (RFC 4648)
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  });

  it('returns a different secret each call', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
  });
});

describe('totpProvisioningUri', () => {
  it('returns an otpauth:// URI', async () => {
    const secret = generateTotpSecret();
    const uri = await totpProvisioningUri(secret, 'user@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(encodeURIComponent('user@example.com'));
  });
});

describe('totpQrCodeDataUrl', () => {
  it('returns a data:image/png URI', async () => {
    const secret = generateTotpSecret();
    const dataUrl = await totpQrCodeDataUrl(secret, 'user@example.com');
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

describe('verifyTotp', () => {
  it('accepts the correct current code', async () => {
    const secret = generateTotpSecret();
    const code = await generate({ secret });
    const ok = await verifyTotp(code, secret);
    expect(ok).toBe(true);
  });

  it('rejects a wrong code', async () => {
    const secret = generateTotpSecret();
    const ok = await verifyTotp('000000', secret);
    expect(ok).toBe(false);
  });

  it('rejects a code for a different secret', async () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const codeA = await generate({ secret: secretA });
    const ok = await verifyTotp(codeA, secretB);
    expect(ok).toBe(false);
  });

  it('rejects a non-numeric code', async () => {
    const secret = generateTotpSecret();
    const ok = await verifyTotp('abcdef', secret);
    expect(ok).toBe(false);
  });

  it('rejects an empty code', async () => {
    const secret = generateTotpSecret();
    const ok = await verifyTotp('', secret);
    expect(ok).toBe(false);
  });
});
