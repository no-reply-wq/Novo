/**
 * Tests for the tenant secrets encryption module.
 */

import { encryptSecret, decryptSecret } from '../secrets.js';

const TENANT_SLUG = 'test-tenant';

beforeAll(() => {
  process.env['TENANT_SECRETS_KEY'] = 'test-master-key-at-least-32-characters-long';
});

afterAll(() => {
  delete process.env['TENANT_SECRETS_KEY'];
});

describe('secrets encryption', () => {
  it('encryptSecret produces a base64 string', async () => {
    const ciphertext = await encryptSecret('my-secret-value', TENANT_SLUG);
    expect(typeof ciphertext).toBe('string');
    expect(ciphertext.length).toBeGreaterThan(0);
    // Should be base64
    expect(() => Buffer.from(ciphertext, 'base64')).not.toThrow();
  });

  it('decryptSecret recovers the original value', async () => {
    const original = 'super-secret-api-key-12345!@#';
    const ciphertext = await encryptSecret(original, TENANT_SLUG);
    const decrypted = await decryptSecret(ciphertext, TENANT_SLUG);
    expect(decrypted).toBe(original);
  });

  it('two encryptions of the same value produce different ciphertexts (random IV)', async () => {
    const value = 'same-value';
    const c1 = await encryptSecret(value, TENANT_SLUG);
    const c2 = await encryptSecret(value, TENANT_SLUG);
    expect(c1).not.toBe(c2);
    // But both decrypt to the same value
    expect(await decryptSecret(c1, TENANT_SLUG)).toBe(value);
    expect(await decryptSecret(c2, TENANT_SLUG)).toBe(value);
  });

  it('decryptSecret fails with a different tenantSlug (wrong key)', async () => {
    const ciphertext = await encryptSecret('value', TENANT_SLUG);
    await expect(decryptSecret(ciphertext, 'other-tenant')).rejects.toThrow();
  });

  it('decryptSecret fails with tampered ciphertext', async () => {
    const ciphertext = await encryptSecret('value', TENANT_SLUG);
    const buf = Buffer.from(ciphertext, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip last byte
    const tampered = buf.toString('base64');
    await expect(decryptSecret(tampered, TENANT_SLUG)).rejects.toThrow();
  });

  it('throws if TENANT_SECRETS_KEY is not set', async () => {
    const saved = process.env['TENANT_SECRETS_KEY'];
    delete process.env['TENANT_SECRETS_KEY'];
    await expect(encryptSecret('value', TENANT_SLUG)).rejects.toThrow('TENANT_SECRETS_KEY');
    process.env['TENANT_SECRETS_KEY'] = saved;
  });
});
