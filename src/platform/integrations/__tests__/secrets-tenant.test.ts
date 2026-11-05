/**
 * Tests for tenant-scoped secret encryption (secrets.ts).
 *
 * Verifies encrypt → decrypt round-trip, isolation between tenants,
 * and correct rejection of tampered / wrong-tenant ciphertext.
 */

// Set a known PLATFORM_SECRET before importing the module
process.env['PLATFORM_SECRET'] = 'test-platform-secret-for-unit-tests';

import { encryptSecret, decryptSecret } from '../secrets';

afterAll(() => {
  delete process.env['PLATFORM_SECRET'];
});

describe('encryptSecret / decryptSecret (tenant-scoped)', () => {
  it('encrypts and decrypts a plaintext value', () => {
    const plaintext = 'my-api-key-12345';
    const encrypted = encryptSecret(plaintext, 'tenant-a');
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted, 'tenant-a')).toBe(plaintext);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const enc1 = encryptSecret('same-value', 'tenant-a');
    const enc2 = encryptSecret('same-value', 'tenant-a');
    expect(enc1).not.toBe(enc2);
    expect(decryptSecret(enc1, 'tenant-a')).toBe('same-value');
    expect(decryptSecret(enc2, 'tenant-a')).toBe('same-value');
  });

  it('keys are tenant-scoped: ciphertext from tenant-a cannot be decrypted by tenant-b', () => {
    const encrypted = encryptSecret('cross-tenant-secret', 'tenant-a');
    expect(() => decryptSecret(encrypted, 'tenant-b')).toThrow();
  });

  it('throws for tampered ciphertext', () => {
    const encrypted = encryptSecret('do-not-tamper', 'tenant-x');
    const buf = Buffer.from(encrypted, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => decryptSecret(buf.toString('base64'), 'tenant-x')).toThrow();
  });

  it('throws for too-short ciphertext', () => {
    expect(() => decryptSecret(Buffer.alloc(5).toString('base64'), 'tenant-x')).toThrow(
      'too short'
    );
  });

  it('handles Unicode and special characters', () => {
    const plaintext = 'unicode: 日本語 🔑 &<>"\'';
    const encrypted = encryptSecret(plaintext, 'tenant-unicode');
    expect(decryptSecret(encrypted, 'tenant-unicode')).toBe(plaintext);
  });

  it('throws NotConfiguredError when PLATFORM_SECRET is not set', () => {
    const original = process.env['PLATFORM_SECRET'];
    delete process.env['PLATFORM_SECRET'];
    try {
      expect(() => encryptSecret('x', 'tenant')).toThrow('PLATFORM_SECRET');
    } finally {
      if (original !== undefined) process.env['PLATFORM_SECRET'] = original;
    }
  });
});
