/**
 * AES-256-GCM secret encryption/decryption.
 *
 * Master key comes from process.env.PLATFORM_SECRET_KEY (32-byte hex string).
 * The encrypted form is base64(iv[12] + authTag[16] + ciphertext).
 *
 * NEVER log or expose the decrypted value in error messages.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotConfiguredError';
  }
}

export function getMasterKey(): Buffer {
  const hex = process.env.PLATFORM_SECRET_KEY;
  if (!hex || hex.length !== 64) {
    throw new NotConfiguredError(
      'PLATFORM_SECRET_KEY must be set to a 64-character hex string (32 bytes)'
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext secret.
 * Returns base64(iv + authTag + ciphertext).
 */
export function encryptSecret(plaintext: string, masterKey: Buffer): string {
  if (masterKey.length !== 32) {
    throw new Error('Master key must be 32 bytes for AES-256-GCM');
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: iv (12) | authTag (16) | ciphertext (variable)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt an encrypted secret.
 * Input must be base64(iv + authTag + ciphertext) as returned by encryptSecret.
 */
export function decryptSecret(ciphertext: string, masterKey: Buffer): string {
  if (masterKey.length !== 32) {
    throw new Error('Master key must be 32 bytes for AES-256-GCM');
  }
  const combined = Buffer.from(ciphertext, 'base64');
  if (combined.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Invalid encrypted secret: too short');
  }
  const iv = combined.subarray(0, IV_BYTES);
  const authTag = combined.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = combined.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);
  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // Do NOT include any secret value in this error message
    throw new Error('Failed to decrypt secret: authentication tag mismatch or key mismatch');
  }
}
