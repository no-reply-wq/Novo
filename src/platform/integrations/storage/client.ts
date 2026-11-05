/**
 * S3 / R2 storage integration client.
 *
 * Thin wrapper over src/lib/storage.ts that accepts a ConnectorDef
 * with kind 'aws_s3', loads and decrypts secrets, then delegates
 * to the existing storage functions.
 */

import type { ConnectorDef } from '@/platform/contracts';
import {
  uploadFile as libUploadFile,
  getSignedUrl as libGetSignedUrl,
  presignUrl,
} from '@/lib/storage';
import { validateFileType } from './validation';
import { pgPool } from '@/lib/db/client';
import { getSecretValue } from '../secrets/store';

export interface StorageClientOptions {
  connector: ConnectorDef;
}

async function loadConnectorDef(connectorId: string): Promise<ConnectorDef> {
  const result = await pgPool.query<{ data: ConnectorDef }>(
    `SELECT data FROM public.connector_defs WHERE id = $1`,
    [connectorId]
  );
  if (result.rows.length === 0) {
    throw new Error(`ConnectorDef not found: ${connectorId}`);
  }
  return result.rows[0].data;
}

export class StorageClient {
  private connector: ConnectorDef;

  constructor(opts: StorageClientOptions) {
    this.connector = opts.connector;
  }

  static async fromConnectorId(connectorId: string): Promise<StorageClient> {
    const connector = await loadConnectorDef(connectorId);
    return new StorageClient({ connector });
  }

  private async getS3Config(): Promise<{
    bucket: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
  }> {
    if (!this.connector.storage) {
      throw new Error('ConnectorDef missing storage config');
    }

    const accessKeyRef = this.connector.secrets['accessKeyId'];
    const secretKeyRef = this.connector.secrets['secretAccessKey'];

    if (!accessKeyRef || !secretKeyRef) {
      throw new Error('ConnectorDef missing accessKeyId or secretAccessKey secret');
    }

    const accessKeyId = await getSecretValue(accessKeyRef);
    const secretAccessKey = await getSecretValue(secretKeyRef);

    const endpoint =
      this.connector.storage.endpoint ??
      `https://s3.${this.connector.storage.region}.amazonaws.com`;

    return {
      bucket: this.connector.storage.bucket,
      region: this.connector.storage.region,
      endpoint,
      accessKeyId,
      secretAccessKey,
    };
  }

  /**
   * Upload a file buffer.
   * Validates magic bytes before uploading.
   * Returns the public CDN URL if configured, otherwise the storage key.
   */
  async upload(file: Buffer, mimeType: string, key: string): Promise<string> {
    validateFileType(mimeType, file, key);

    if (this.connector.kind === 'aws_s3') {
      const s3 = await this.getS3Config();

      // Upload using presigned PUT
      const putUrl = presignUrl({
        bucket: s3.bucket,
        region: s3.region,
        endpoint: s3.endpoint,
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
        key,
        method: 'PUT',
        expiresIn: 60,
        contentType: mimeType,
      });

      const res = await fetch(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: new Blob([new Uint8Array(file)]),
      });

      if (!res.ok) {
        throw new Error(`S3 upload failed: ${res.status} ${res.statusText}`);
      }

      if (this.connector.storage?.publicBaseUrl) {
        return `${this.connector.storage.publicBaseUrl.replace(/\/$/, '')}/${key}`;
      }
      return key;
    }

    // Fall back to default lib (uses env-based R2 config)
    return libUploadFile(key, file, mimeType);
  }

  /**
   * Generate a presigned download URL for a stored file.
   */
  async getPresignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (this.connector.kind === 'aws_s3') {
      const s3 = await this.getS3Config();
      return presignUrl({
        bucket: s3.bucket,
        region: s3.region,
        endpoint: s3.endpoint,
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
        key,
        method: 'GET',
        expiresIn: expiresInSeconds,
      });
    }

    return libGetSignedUrl(key, expiresInSeconds);
  }

  /**
   * Delete a file from storage.
   */
  async deleteFile(key: string): Promise<void> {
    if (this.connector.kind === 'aws_s3') {
      const s3 = await this.getS3Config();

      // Use a presigned DELETE URL
      const deleteUrl = presignUrl({
        bucket: s3.bucket,
        region: s3.region,
        endpoint: s3.endpoint,
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
        key,
        method: 'GET',  // presignUrl only supports GET/PUT; use DELETE via fetch directly
        expiresIn: 60,
      });

      // We'll construct the endpoint directly for DELETE
      const url = `${s3.endpoint}/${s3.bucket}/${key}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        throw new Error(`S3 delete failed: ${res.status} ${res.statusText} for ${deleteUrl}`);
      }
      return;
    }

    throw new Error('deleteFile not supported without aws_s3 connector kind');
  }
}
