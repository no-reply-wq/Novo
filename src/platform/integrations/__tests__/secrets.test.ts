/**
 * Tests for secrets manager — encrypt → store → retrieve → decrypt round-trip.
 */

import { jest } from '@jest/globals';

// ── Mock DB ────────────────────────────────────────────────────────────────────
const secretsDb = new Map<string, string>();

const mockQuery = jest.fn<(sql: unknown, params?: unknown[]) => Promise<{ rows: { id: string }[] | { encrypted_value: string }[] }>>().mockImplementation(
  async (sql: unknown, params?: unknown[]) => {
    const sqlStr = String(sql);

    if (sqlStr.includes('INSERT INTO public.platform_secrets')) {
      const id = `sec-${Math.random().toString(36).slice(2)}`;
      const encryptedValue = (params as unknown[])?.[2] as string;
      secretsDb.set(id, encryptedValue);
      return { rows: [{ id }] };
    }

    if (sqlStr.includes('SELECT encrypted_value FROM public.platform_secrets')) {
      const id = (params as unknown[])?.[0] as string;
      const encrypted = secretsDb.get(id);
      if (!encrypted) return { rows: [] };
      return { rows: [{ encrypted_value: encrypted }] };
    }

    if (sqlStr.includes('UPDATE public.platform_secrets')) {
      const encryptedValue = (params as unknown[])?.[0] as string;
      const id = (params as unknown[])?.[2] as string;
      if (secretsDb.has(id)) {
        secretsDb.set(id, encryptedValue);
        return { rows: [{ id }] };
      }
      return { rows: [] };
    }

    return { rows: [] };
  }
);

jest.mock('@/lib/db/client', () => ({
  pgPool: { query: mockQuery },
}));

// ── Set up master key ──────────────────────────────────────────────────────────
const TEST_MASTER_KEY = 'a'.repeat(64); // 32-byte key as hex

import { encryptSecret, decryptSecret, getMasterKey } from '../secrets/manager';
import { storeSecret, getSecretValue, rotateSecret } from '../secrets/store';

describe('encryptSecret / decryptSecret', () => {
  const key = Buffer.from(TEST_MASTER_KEY, 'hex');

  it('encrypts and decrypts a plaintext secret', () => {
    const plaintext = 'my-api-key-12345';
    const encrypted = encryptSecret(plaintext, key);
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toContain(plaintext); // must not be readable
    const decrypted = decryptSecret(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const plaintext = 'same-value';
    const enc1 = encryptSecret(plaintext, key);
    const enc2 = encryptSecret(plaintext, key);
    expect(enc1).not.toBe(enc2);
    // Both must still decrypt correctly
    expect(decryptSecret(enc1, key)).toBe(plaintext);
    expect(decryptSecret(enc2, key)).toBe(plaintext);
  });

  it('throws when decrypting with a wrong key', () => {
    const plaintext = 'secret-value';
    const encrypted = encryptSecret(plaintext, key);
    const wrongKey = Buffer.from('b'.repeat(64), 'hex');
    expect(() => decryptSecret(encrypted, wrongKey)).toThrow();
  });

  it('throws when ciphertext is tampered', () => {
    const plaintext = 'do-not-tamper';
    const encrypted = encryptSecret(plaintext, key);
    const buf = Buffer.from(encrypted, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip last byte
    const tampered = buf.toString('base64');
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('throws for too-short ciphertext', () => {
    expect(() => decryptSecret(Buffer.alloc(5).toString('base64'), key)).toThrow(
      'too short'
    );
  });

  it('throws when master key is not 32 bytes', () => {
    const shortKey = Buffer.alloc(16);
    expect(() => encryptSecret('x', shortKey)).toThrow('32 bytes');
    expect(() => decryptSecret('anything', shortKey)).toThrow('32 bytes');
  });
});

describe('getMasterKey', () => {
  const originalEnv = process.env['PLATFORM_SECRET_KEY'];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['PLATFORM_SECRET_KEY'] = originalEnv;
    } else {
      delete process.env['PLATFORM_SECRET_KEY'];
    }
  });

  it('returns a 32-byte Buffer when env is a 64-char hex string', () => {
    process.env['PLATFORM_SECRET_KEY'] = TEST_MASTER_KEY;
    const key = getMasterKey();
    expect(key.length).toBe(32);
  });

  it('throws NotConfiguredError when env is missing', () => {
    delete process.env['PLATFORM_SECRET_KEY'];
    expect(() => getMasterKey()).toThrow('PLATFORM_SECRET_KEY');
  });

  it('throws NotConfiguredError when env is wrong length', () => {
    process.env['PLATFORM_SECRET_KEY'] = 'too-short';
    expect(() => getMasterKey()).toThrow('PLATFORM_SECRET_KEY');
  });
});

describe('storeSecret / getSecretValue / rotateSecret round-trip', () => {
  beforeEach(() => {
    secretsDb.clear();
    process.env['PLATFORM_SECRET_KEY'] = TEST_MASTER_KEY;
  });

  afterAll(() => {
    delete process.env['PLATFORM_SECRET_KEY'];
  });

  it('stores a secret and retrieves the original plaintext', async () => {
    const ref = await storeSecret('app-1', 'api-key', 'super-secret-value');
    expect(ref.secretId).toBeTruthy();
    expect(ref.hint).toBe('alue'); // last 4 chars of 'super-secret-value'

    const retrieved = await getSecretValue(ref);
    expect(retrieved).toBe('super-secret-value');
  });

  it('rotates a secret and retrieves the new plaintext', async () => {
    const ref = await storeSecret('app-1', 'api-key', 'old-value');
    const newRef = await rotateSecret(ref, 'new-value');
    expect(newRef.secretId).toBe(ref.secretId);

    const retrieved = await getSecretValue(newRef);
    expect(retrieved).toBe('new-value');
  });

  it('throws when secret is not found', async () => {
    await expect(getSecretValue({ secretId: 'non-existent-id' })).rejects.toThrow(
      'Secret not found'
    );
  });

  it('never exposes plaintext in error message when decryption fails', () => {
    const key = Buffer.from(TEST_MASTER_KEY, 'hex');
    const encrypted = encryptSecret('super-sensitive-password', key);
    // Use a different key to cause auth tag mismatch
    const wrongKey = Buffer.from('c'.repeat(64), 'hex');
    let errorMessage = '';
    try {
      decryptSecret(encrypted, wrongKey);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    expect(errorMessage).not.toContain('super-sensitive-password');
  });
});
