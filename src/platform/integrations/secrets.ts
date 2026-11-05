/**
 * Tenant-scoped secret encryption using HKDF key derivation.
 *
 * Key derivation: HKDF-SHA256(PLATFORM_SECRET + tenantSlug) → 32-byte AES key
 * Encryption:     AES-256-GCM with random IV
 * Wire format:    base64(iv[12] | authTag[16] | ciphertext)
 *
 * This module uses Node's built-in `crypto` only — no external libraries.
 */

import crypto from 'crypto';
import { NotConfiguredError } from './secrets/manager';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/**
 * Derive a 32-byte encryption key from PLATFORM_SECRET and tenantSlug using HKDF.
 */
function deriveKey(tenantSlug: string): Buffer {
  const secret = process.env['PLATFORM_SECRET'];
  if (!secret) {
    throw new NotConfiguredError(
      'PLATFORM_SECRET environment variable must be set'
    );
  }

  // HKDF: Extract + Expand
  // Extract: PRK = HMAC-SHA256(salt=tenantSlug, ikm=PLATFORM_SECRET)
  const prk = crypto.createHmac('sha256', tenantSlug).update(secret).digest();

  // Expand: OKM = HKDF-Expand(PRK, info="integration-secret", length=32)
  const info = Buffer.from('integration-secret', 'utf8');
  const counter = Buffer.alloc(1, 1);
  const okm = crypto
    .createHmac('sha256', prk)
    .update(Buffer.concat([info, counter]))
    .digest();

  return okm.subarray(0, KEY_BYTES);
}

/**
 * Encrypt a secret value scoped to a tenant.
 * Returns base64(iv | authTag | ciphertext).
 */
export function encryptSecret(value: string, tenantSlug: string): string {
  const key = deriveKey(tenantSlug);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a secret value scoped to a tenant.
 * Input must be base64(iv | authTag | ciphertext) as returned by encryptSecret.
 */
export function decryptSecret(encrypted: string, tenantSlug: string): string {
  const key = deriveKey(tenantSlug);
  const combined = Buffer.from(encrypted, 'base64');

  if (combined.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Invalid encrypted secret: too short');
  }

  const iv = combined.subarray(0, IV_BYTES);
  const authTag = combined.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = combined.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // Never include plaintext or key material in error messages
    throw new Error('Failed to decrypt secret: authentication tag mismatch or key mismatch');
  }
}
