/**
 * Storage types for S3 / R2 file storage.
 */

export interface StorageConfig {
  provider: 's3' | 'r2';
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // R2: https://<account>.r2.cloudflarestorage.com
  publicBaseUrl?: string; // for public buckets
}

export interface UploadedFile {
  key: string;
  bucket: string;
  size: number;
  contentType: string;
  url?: string; // signed URL or public URL
  uploadedAt: Date;
}

export interface UploadParams {
  key: string;
  body: Buffer | import('stream').Readable;
  contentType: string;
  metadata?: Record<string, string>;
}
