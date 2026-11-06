/**
 * Tests for src/platform/storage/client.ts
 *
 * Mocks @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner.
 */

import { jest } from '@jest/globals';

// ─── Mock AWS SDK ─────────────────────────────────────────────────────────────

const mockSend = jest.fn<() => Promise<unknown>>();

const mockS3ClientConstructor = jest.fn().mockImplementation(() => ({
  send: mockSend,
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: mockS3ClientConstructor,
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input, type: 'PutObject' })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input, type: 'DeleteObject' })),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => ({ input, type: 'ListObjectsV2' })),
  HeadObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input, type: 'HeadObject' })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input, type: 'GetObject' })),
}));

const mockGetSignedUrl = jest.fn<() => Promise<string>>().mockResolvedValue(
  'https://s3.amazonaws.com/my-bucket/some-key?X-Amz-Expires=3600&X-Amz-Signature=abc'
);

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

import { StorageClient, getStorageClient } from '../client';
import { NotConfiguredError } from '@/platform/integrations/secrets/manager';
import type { StorageConfig } from '../types';

const baseConfig: StorageConfig = {
  provider: 's3',
  bucket: 'my-test-bucket',
  region: 'us-east-1',
  accessKeyId: 'AKIATEST123',
  secretAccessKey: 'testSecretKey',
};

const r2Config: StorageConfig = {
  provider: 'r2',
  bucket: 'r2-test-bucket',
  region: 'auto',
  accessKeyId: 'r2AccessKey',
  secretAccessKey: 'r2SecretKey',
  endpoint: 'https://abc123.r2.cloudflarestorage.com',
};

describe('StorageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  // ─── Constructor / NotConfiguredError ─────────────────────────────────────

  describe('constructor / NotConfiguredError', () => {
    it('throws NotConfiguredError when bucket is missing', () => {
      expect(() => new StorageClient({ ...baseConfig, bucket: '' })).toThrow(NotConfiguredError);
    });

    it('throws NotConfiguredError when accessKeyId is missing', () => {
      expect(() => new StorageClient({ ...baseConfig, accessKeyId: '' })).toThrow(NotConfiguredError);
    });

    it('throws NotConfiguredError when secretAccessKey is missing', () => {
      expect(() => new StorageClient({ ...baseConfig, secretAccessKey: '' })).toThrow(NotConfiguredError);
    });

    it('constructs successfully with valid config', () => {
      expect(() => new StorageClient(baseConfig)).not.toThrow();
    });
  });

  // ─── upload ───────────────────────────────────────────────────────────────

  describe('upload', () => {
    it('calls PutObjectCommand with the correct key and contentType', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new StorageClient(baseConfig);
      const body = Buffer.from('hello world');

      await client.upload({ key: 'tenant/table/rec/field/file.pdf', body, contentType: 'application/pdf' });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'my-test-bucket',
          Key: 'tenant/table/rec/field/file.pdf',
          ContentType: 'application/pdf',
        })
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('returns UploadedFile with correct size and bucket', async () => {
      const client = new StorageClient(baseConfig);
      const body = Buffer.from('test data');
      const result = await client.upload({ key: 'k/file.txt', body, contentType: 'text/plain' });

      expect(result.key).toBe('k/file.txt');
      expect(result.bucket).toBe('my-test-bucket');
      expect(result.size).toBe(body.byteLength);
      expect(result.uploadedAt).toBeInstanceOf(Date);
    });

    it('sets public url when publicBaseUrl is configured', async () => {
      const client = new StorageClient({ ...baseConfig, publicBaseUrl: 'https://cdn.example.com' });
      const body = Buffer.from('img data');
      const result = await client.upload({ key: 'photos/img.jpg', body, contentType: 'image/jpeg' });

      expect(result.url).toBe('https://cdn.example.com/photos/img.jpg');
    });

    it('passes metadata to PutObjectCommand', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new StorageClient(baseConfig);
      const body = Buffer.from('data');
      await client.upload({
        key: 'x/y.txt',
        body,
        contentType: 'text/plain',
        metadata: { uploadedBy: 'user-1', originalName: 'report.txt' },
      });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: { uploadedBy: 'user-1', originalName: 'report.txt' },
        })
      );
    });
  });

  // ─── getSignedUrl ─────────────────────────────────────────────────────────

  describe('getSignedUrl', () => {
    it('calls GetObjectCommand presigner with the key and default expiry', async () => {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new StorageClient(baseConfig);

      const url = await client.getSignedUrl('docs/invoice.pdf');

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'my-test-bucket', Key: 'docs/invoice.pdf' })
      );
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 }
      );
      expect(url).toContain('X-Amz-Expires=3600');
    });

    it('passes custom expiresIn to presigner', async () => {
      const client = new StorageClient(baseConfig);
      await client.getSignedUrl('docs/secret.pdf', 900);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 900 }
      );
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('calls DeleteObjectCommand with the correct key', async () => {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new StorageClient(baseConfig);

      await client.delete('uploads/old-file.csv');

      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'my-test-bucket',
          Key: 'uploads/old-file.csv',
        })
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  // ─── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('calls ListObjectsV2Command with the prefix', async () => {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'tenant/t1/r1/f1/a.pdf', Size: 100, LastModified: new Date() },
          { Key: 'tenant/t1/r1/f1/b.csv', Size: 200, LastModified: new Date() },
        ],
      });

      const client = new StorageClient(baseConfig);
      const files = await client.list('tenant/t1/r1/f1/');

      expect(ListObjectsV2Command).toHaveBeenCalledWith(
        expect.objectContaining({ Prefix: 'tenant/t1/r1/f1/' })
      );
      expect(files).toHaveLength(2);
      expect(files[0].key).toBe('tenant/t1/r1/f1/a.pdf');
    });
  });

  // ─── exists ───────────────────────────────────────────────────────────────

  describe('exists', () => {
    it('returns true when HeadObject succeeds', async () => {
      const client = new StorageClient(baseConfig);
      mockSend.mockResolvedValueOnce({ ContentLength: 42 });

      const result = await client.exists('some/key.pdf');
      expect(result).toBe(true);
    });

    it('returns false when HeadObject throws 404 NotFound', async () => {
      const client = new StorageClient(baseConfig);
      const notFoundErr = Object.assign(new Error('Not Found'), { name: 'NotFound' });
      mockSend.mockRejectedValueOnce(notFoundErr);

      const result = await client.exists('missing.pdf');
      expect(result).toBe(false);
    });

    it('re-throws unexpected errors from HeadObject', async () => {
      const client = new StorageClient(baseConfig);
      mockSend.mockRejectedValueOnce(new Error('Network failure'));

      await expect(client.exists('some.pdf')).rejects.toThrow('Network failure');
    });
  });

  // ─── R2 with custom endpoint ──────────────────────────────────────────────

  describe('R2 with custom endpoint', () => {
    it('constructs S3Client with custom endpoint for R2', () => {
      new StorageClient(r2Config);

      expect(mockS3ClientConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://abc123.r2.cloudflarestorage.com',
          forcePathStyle: true,
        })
      );
    });

    it('uses r2 bucket in PutObjectCommand', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new StorageClient(r2Config);
      await client.upload({ key: 'r2/file.txt', body: Buffer.from('x'), contentType: 'text/plain' });

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'r2-test-bucket' })
      );
    });
  });

  // ─── Factory ──────────────────────────────────────────────────────────────

  describe('getStorageClient', () => {
    it('returns a StorageClient instance', () => {
      const client = getStorageClient(baseConfig);
      expect(client).toBeInstanceOf(StorageClient);
    });

    it('throws NotConfiguredError for invalid config', () => {
      expect(() => getStorageClient({ ...baseConfig, bucket: '' })).toThrow(NotConfiguredError);
    });
  });
});
