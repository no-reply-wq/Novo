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
import { pgPool } from '@/lib/db/client';

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

  if (combined.length < IV_BYTES + TAG_BYTES) {
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


// ─── Tenant-scoped secrets CRUD (platform.integration_secrets table) ──────────

export interface SecretMeta {
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Encrypt and upsert a secret for the given app + tenant.
 */
export async function setSecret(
  appId: string,
  tenantSlug: string,
  name: string,
  value: string,
): Promise<void> {
  const encrypted = encryptSecret(value, tenantSlug);
  await pgPool.query(
    `INSERT INTO platform.integration_secrets
       (app_id, tenant_slug, name, encrypted_value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (app_id, tenant_slug, name) DO UPDATE
       SET encrypted_value = EXCLUDED.encrypted_value,
           updated_at      = NOW()`,
    [appId, tenantSlug, name, encrypted],
  );
}

/**
 * Decrypt and return a secret value.
 * Returns null if not found.
 */
export async function getSecret(
  appId: string,
  tenantSlug: string,
  name: string,
): Promise<string | null> {
  const result = await pgPool.query<{ encrypted_value: string }>(
    `SELECT encrypted_value FROM platform.integration_secrets
     WHERE app_id = $1 AND tenant_slug = $2 AND name = $3`,
    [appId, tenantSlug, name],
  );
  if (result.rows.length === 0) return null;
  return decryptSecret(result.rows[0].encrypted_value, tenantSlug);
}

/**
 * List secret metadata (names + timestamps) — values are never returned.
 */
export async function listSecrets(
  appId: string,
  tenantSlug: string,
): Promise<SecretMeta[]> {
  const result = await pgPool.query<{ name: string; created_at: Date; updated_at: Date }>(
    `SELECT name, created_at, updated_at
     FROM platform.integration_secrets
     WHERE app_id = $1 AND tenant_slug = $2
     ORDER BY name`,
    [appId, tenantSlug],
  );
  return result.rows.map((r) => ({
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Delete a secret by name.
 */
export async function deleteSecret(
  appId: string,
  tenantSlug: string,
  name: string,
): Promise<void> {
  await pgPool.query(
    `DELETE FROM platform.integration_secrets
     WHERE app_id = $1 AND tenant_slug = $2 AND name = $3`,
    [appId, tenantSlug, name],
  );
}
