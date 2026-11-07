/**
 * Unit tests for AES-256-GCM encrypt/decrypt roundtrip.
 * No database required.
 */

process.env['PLATFORM_SECRET'] = 'test-platform-secret-for-unit-tests-only';

import { encryptSecret, decryptSecret } from '../../platform/integrations/secrets';

describe('tenant-scoped secrets encryption', () => {
  const tenantSlug = 'test-tenant';

  it('roundtrips a simple string', () => {
    const original = 'my-super-secret-api-key';
    const encrypted = encryptSecret(original, tenantSlug);
    expect(encrypted).not.toBe(original);
    const decrypted = decryptSecret(encrypted, tenantSlug);
    expect(decrypted).toBe(original);
  });

  it('roundtrips an empty string', () => {
    const original = '';
    const encrypted = encryptSecret(original, tenantSlug);
    const decrypted = decryptSecret(encrypted, tenantSlug);
    expect(decrypted).toBe(original);
  });

  it('roundtrips unicode content', () => {
    const original = 'कुंजी 🔑 клюc 密钥';
    const encrypted = encryptSecret(original, tenantSlug);
    const decrypted = decryptSecret(encrypted, tenantSlug);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const original = 'same-value';
    const enc1 = encryptSecret(original, tenantSlug);
    const enc2 = encryptSecret(original, tenantSlug);
    expect(enc1).not.toBe(enc2);
  });

  it('fails to decrypt with wrong tenant slug', () => {
    const original = 'secret';
    const encrypted = encryptSecret(original, tenantSlug);
    expect(() => decryptSecret(encrypted, 'other-tenant')).toThrow();
  });

  it('fails to decrypt tampered ciphertext', () => {
    const original = 'secret';
    const encrypted = encryptSecret(original, tenantSlug);
    const bytes = Buffer.from(encrypted, 'base64');
    // Flip a byte in the ciphertext portion
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = bytes.toString('base64');
    expect(() => decryptSecret(tampered, tenantSlug)).toThrow();
  });

  it('throws NotConfiguredError if PLATFORM_SECRET is missing', () => {
    const saved = process.env['PLATFORM_SECRET'];
    delete process.env['PLATFORM_SECRET'];
    expect(() => encryptSecret('x', tenantSlug)).toThrow('PLATFORM_SECRET');
    process.env['PLATFORM_SECRET'] = saved;
  });
});
