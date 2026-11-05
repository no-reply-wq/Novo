/**
 * Tenant-slug-based storage integration.
 *
 * Loads the tenant's s3 or r2 config from platform.integration_configs,
 * decrypts credentials, and uses the platform presignUrl utility for
 * uploads, downloads, and deletes.
 *
 * Key pattern: {tenantSlug}/{table}/{recordId}/{filename}
 */

import { pgPool } from '@/lib/db/client';
import { presignUrl } from '@/lib/storage';
import { decryptSecret } from '../secrets';
import { NotConfiguredError } from '../secrets/manager';

export interface UploadFileParams {
  tenantSlug: string;
  key: string;
  buffer: Buffer;
  contentType: string;
  visibility: 'private' | 'public';
}

export interface UploadFileResult {
  url: string;
  key: string;
}

interface StorageConfig {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
}

async function loadStorageConfig(tenantSlug: string): Promise<StorageConfig> {
  const result = await pgPool.query<{ config: Record<string, string>; type: string }>(
    `SELECT type, config FROM platform.integration_configs
     WHERE tenant_slug = $1 AND type IN ('s3', 'r2') AND enabled = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantSlug]
  );

  if (result.rows.length === 0) {
    throw new NotConfiguredError(
      `No enabled s3 or r2 integration found for tenant: ${tenantSlug}`
    );
  }

  const { config, type } = result.rows[0];

  if (!config['bucket'] || !config['region'] || !config['accessKeyId'] || !config['secretAccessKey']) {
    throw new NotConfiguredError(
      `Storage integration for tenant ${tenantSlug} is missing required fields`
    );
  }

  const accessKeyId = decryptSecret(config['accessKeyId'], tenantSlug);
  const secretAccessKey = decryptSecret(config['secretAccessKey'], tenantSlug);

  // R2 requires a custom endpoint: https://{accountId}.r2.cloudflarestorage.com
  const endpoint =
    config['endpoint'] ??
    (type === 'r2'
      ? `https://${config['accountId'] ?? ''}.r2.cloudflarestorage.com`
      : `https://s3.${config['region']}.amazonaws.com`);

  return {
    bucket: config['bucket'],
    region: config['region'],
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: config['publicBaseUrl'],
  };
}

/**
 * Upload a file buffer to tenant storage using a presigned PUT URL.
 */
export async function uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
  const cfg = await loadStorageConfig(params.tenantSlug);

  const putUrl = presignUrl({
    bucket: cfg.bucket,
    region: cfg.region,
    endpoint: cfg.endpoint,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    key: params.key,
    method: 'PUT',
    expiresIn: 60,
    contentType: params.contentType,
  });

  const res = await fetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': params.contentType },
    body: new Blob([new Uint8Array(params.buffer)]),
  });

  if (!res.ok) {
    throw new Error(`Storage upload failed: ${res.status} ${res.statusText}`);
  }

  const url = cfg.publicBaseUrl
    ? `${cfg.publicBaseUrl.replace(/\/$/, '')}/${params.key}`
    : `${cfg.endpoint}/${cfg.bucket}/${params.key}`;

  return { url, key: params.key };
}

/**
 * Generate a presigned download URL for a stored file.
 */
export async function getSignedDownloadUrl(params: {
  tenantSlug: string;
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const { tenantSlug, key, expiresIn = 3600 } = params;
  const cfg = await loadStorageConfig(tenantSlug);

  return presignUrl({
    bucket: cfg.bucket,
    region: cfg.region,
    endpoint: cfg.endpoint,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    key,
    method: 'GET',
    expiresIn,
  });
}

/**
 * Delete a file from tenant storage.
 */
export async function deleteFile(tenantSlug: string, key: string): Promise<void> {
  const cfg = await loadStorageConfig(tenantSlug);

  const url = `${cfg.endpoint}/${cfg.bucket}/${key}`;
  const res = await fetch(url, { method: 'DELETE' });

  if (!res.ok && res.status !== 204) {
    throw new Error(`Storage delete failed: ${res.status} ${res.statusText}`);
  }
}
