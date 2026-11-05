/**
 * CRUD against public.platform_secrets.
 *
 * getSecretValue is intentionally NOT exported from the public index.ts —
 * it must only be called by ConnectorRunner internally.
 */

import type { SecretRef } from '@/platform/contracts';
import { pgPool } from '@/lib/db/client';
import { encryptSecret, decryptSecret, getMasterKey } from './manager';

export async function storeSecret(
  appId: string,
  name: string,
  value: string
): Promise<SecretRef> {
  const masterKey = getMasterKey();
  const encrypted = encryptSecret(value, masterKey);
  const hint = value.length >= 4 ? value.slice(-4) : '****';

  const result = await pgPool.query<{ id: string }>(
    `INSERT INTO public.platform_secrets (app_id, name, encrypted_value, hint)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (app_id, name) DO UPDATE
       SET encrypted_value = EXCLUDED.encrypted_value,
           hint             = EXCLUDED.hint,
           updated_at       = NOW()
     RETURNING id`,
    [appId, name, encrypted, hint]
  );

  return { secretId: result.rows[0].id, hint };
}

/**
 * Retrieve and decrypt a secret value.
 *
 * INTERNAL USE ONLY — not exported from integrations/index.ts.
 * Never expose this via any public API route or tenant script.
 */
export async function getSecretValue(secretRef: SecretRef): Promise<string> {
  const result = await pgPool.query<{ encrypted_value: string }>(
    `SELECT encrypted_value FROM public.platform_secrets WHERE id = $1`,
    [secretRef.secretId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Secret not found: ${secretRef.secretId}`);
  }

  const masterKey = getMasterKey();
  return decryptSecret(result.rows[0].encrypted_value, masterKey);
}

export async function rotateSecret(
  secretRef: SecretRef,
  newValue: string
): Promise<SecretRef> {
  const masterKey = getMasterKey();
  const encrypted = encryptSecret(newValue, masterKey);
  const hint = newValue.length >= 4 ? newValue.slice(-4) : '****';

  const result = await pgPool.query<{ id: string }>(
    `UPDATE public.platform_secrets
     SET encrypted_value = $1, hint = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id`,
    [encrypted, hint, secretRef.secretId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Secret not found for rotation: ${secretRef.secretId}`);
  }

  return { secretId: result.rows[0].id, hint };
}
