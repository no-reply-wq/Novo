/**
 * Tenant secret storage — AES-256-GCM encryption backed by per-tenant key
 * derived from TENANT_SECRETS_KEY env var + tenantSlug via scrypt.
 */

import crypto from 'crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32; // 256 bits
const IV_LEN = 12;  // 96 bits (GCM standard)
const TAG_LEN = 16; // 128 bits

function getMasterKey(): string {
  const key = process.env['TENANT_SECRETS_KEY'];
  if (!key) throw new Error('TENANT_SECRETS_KEY env var is not set');
  return key;
}

/** Derive a per-tenant 32-byte key using scrypt. */
async function deriveKey(tenantSlug: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const masterKey = getMasterKey();
    crypto.scrypt(
      masterKey,
      `tenant:${tenantSlug}`,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });
}

/**
 * Encrypt a secret value for a given tenant.
 * Returns a base64-encoded string: iv(12) || tag(16) || ciphertext.
 */
export async function encryptSecret(value: string, tenantSlug: string): Promise<string> {
  const key = await deriveKey(tenantSlug);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // iv || tag || ciphertext
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt a ciphertext that was produced by encryptSecret.
 */
export async function decryptSecret(ciphertext: string, tenantSlug: string): Promise<string> {
  const key = await deriveKey(tenantSlug);
  const combined = Buffer.from(ciphertext, 'base64');

  if (combined.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Invalid ciphertext: too short');
  }

  const iv = combined.subarray(0, IV_LEN);
  const tag = combined.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = combined.subarray(IV_LEN + TAG_LEN);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
