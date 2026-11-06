/**
 * S3 / R2 storage client using the official AWS SDK v3.
 *
 * Key naming convention: {tenantSlug}/{tableId}/{recordId}/{fieldId}/{filename}
 *
 * Throws NotConfiguredError when required credentials are absent.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  type PutObjectCommandInput,
  type ListObjectsV2CommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';
import type { StorageConfig, UploadedFile, UploadParams } from './types';

// ─── Validation ───────────────────────────────────────────────────────────────

function assertConfig(config: StorageConfig): void {
  const missing: string[] = [];
  if (!config.bucket) missing.push('bucket');
  if (!config.region) missing.push('region');
  if (!config.accessKeyId) missing.push('accessKeyId');
  if (!config.secretAccessKey) missing.push('secretAccessKey');

  if (missing.length > 0) {
    throw new NotConfiguredError(
      `StorageConfig is missing required fields: ${missing.join(', ')}`
    );
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class StorageClient {
  private s3: S3Client;
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    assertConfig(config);
    this.config = config;

    const endpoint = config.endpoint;

    this.s3 = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(endpoint ? { endpoint } : {}),
      // Force path-style for R2 and custom endpoints
      forcePathStyle: config.provider === 'r2' || !!config.endpoint,
    });
  }

  /** Upload a file; returns an UploadedFile descriptor. */
  async upload(params: UploadParams): Promise<UploadedFile> {
    const input: PutObjectCommandInput = {
      Bucket: this.config.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      Metadata: params.metadata,
    };

    // Determine byte length for the size field
    let size = 0;
    if (Buffer.isBuffer(params.body)) {
      size = params.body.byteLength;
      input.ContentLength = size;
    }

    await this.s3.send(new PutObjectCommand(input));

    const uploadedAt = new Date();

    let url: string | undefined;
    if (this.config.publicBaseUrl) {
      url = `${this.config.publicBaseUrl.replace(/\/$/, '')}/${params.key}`;
    }

    return {
      key: params.key,
      bucket: this.config.bucket,
      size,
      contentType: params.contentType,
      url,
      uploadedAt,
    };
  }

  /** Get a presigned GET URL valid for `expiresIn` seconds (default 3600). */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  /** Delete a file by key. */
  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    );
  }

  /** List files whose key starts with `prefix`. */
  async list(prefix: string): Promise<UploadedFile[]> {
    const input: ListObjectsV2CommandInput = {
      Bucket: this.config.bucket,
      Prefix: prefix,
    };

    const output = await this.s3.send(new ListObjectsV2Command(input));
    const contents = output.Contents ?? [];

    return contents.map((obj) => ({
      key: obj.Key ?? '',
      bucket: this.config.bucket,
      size: obj.Size ?? 0,
      contentType: '', // ListObjectsV2 does not return ContentType
      uploadedAt: obj.LastModified ?? new Date(),
    }));
  }

  /** Check whether a key exists in the bucket. */
  async exists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        })
      );
      return true;
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (
          err.name === 'NotFound' ||
          err.name === 'NoSuchKey' ||
          ('$metadata' in err &&
            (err as { $metadata: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        ) {
          return false;
        }
      }
      throw err;
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/** Create a StorageClient from a StorageConfig. Throws NotConfiguredError on missing creds. */
export function getStorageClient(config: StorageConfig): StorageClient {
  return new StorageClient(config);
}
