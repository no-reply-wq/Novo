/**
 * Tests for storage client — mocks fetch and DB, asserts correct S3 behavior.
 */

import { jest } from '@jest/globals';

// ── Mock fetch ─────────────────────────────────────────────────────────────────
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch;

// ── Mock DB ────────────────────────────────────────────────────────────────────
const mockQuery = jest.fn<() => Promise<{ rows: unknown[] }>>();
jest.mock('@/lib/db/client', () => ({
  pgPool: { query: mockQuery },
}));

// ── Mock secrets store ─────────────────────────────────────────────────────────
jest.mock('../../secrets/store', () => ({
  getSecretValue: jest.fn<(ref: { secretId: string }) => Promise<string>>().mockImplementation(async (ref: { secretId: string }) => {
    if (ref.secretId === 'secret-key-id') return 'AKIATEST123';
    if (ref.secretId === 'secret-access-key') return 'secret/key/here';
    return 'mock-secret';
  }),
}));

import { StorageClient } from '../client';
import type { ConnectorDef } from '@/platform/contracts';

const s3Connector: ConnectorDef = {
  id: 'conn-s3-1',
  appId: 'app-1',
  name: 'Test S3',
  kind: 'aws_s3',
  secrets: {
    accessKeyId: { secretId: 'secret-key-id' },
    secretAccessKey: { secretId: 'secret-access-key' },
  },
  storage: {
    bucket: 'my-test-bucket',
    region: 'us-east-1',
    endpoint: 'https://s3.us-east-1.amazonaws.com',
  },
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('StorageClient', () => {
  let client: StorageClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new StorageClient({ connector: s3Connector });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    } as Response);
  });

  describe('upload', () => {
    it('calls fetch with PUT method for S3 upload', async () => {
      const buf = Buffer.from('%PDF-1.4 test content');
      await client.upload(buf, 'application/pdf', 'docs/test.pdf');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('my-test-bucket'),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('rejects SVG uploads (magic byte validation)', async () => {
      const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
      await expect(
        client.upload(svgBuf, 'image/svg+xml', 'uploads/evil.svg')
      ).rejects.toThrow();
    });

    it('rejects HTML uploads', async () => {
      const htmlBuf = Buffer.from('<!DOCTYPE html><html><body>XSS</body></html>');
      await expect(
        client.upload(htmlBuf, 'text/html', 'uploads/evil.html')
      ).rejects.toThrow();
    });

    it('returns key when no publicBaseUrl configured', async () => {
      const buf = Buffer.from('fake-jpeg-data');
      const result = await client.upload(buf, 'image/jpeg', 'photos/test.jpg');
      expect(result).toBe('photos/test.jpg');
    });

    it('returns CDN URL when publicBaseUrl is configured', async () => {
      const connectorWithCdn: ConnectorDef = {
        ...s3Connector,
        storage: {
          ...s3Connector.storage!,
          publicBaseUrl: 'https://cdn.example.com',
        },
      };
      const clientWithCdn = new StorageClient({ connector: connectorWithCdn });
      const buf = Buffer.from('fake-jpeg-data');
      const result = await clientWithCdn.upload(buf, 'image/jpeg', 'photos/test.jpg');
      expect(result).toBe('https://cdn.example.com/photos/test.jpg');
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('returns a URL containing the bucket and key', async () => {
      const url = await client.getPresignedDownloadUrl('docs/test.pdf', 3600);
      expect(url).toContain('my-test-bucket');
      expect(url).toContain('docs/test.pdf');
    });

    it('includes expiry in the URL', async () => {
      const url = await client.getPresignedDownloadUrl('file.pdf', 900);
      expect(url).toContain('X-Amz-Expires=900');
    });
  });

  describe('deleteFile', () => {
    it('calls fetch with DELETE method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
      } as Response);

      await client.deleteFile('docs/to-delete.pdf');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('my-test-bucket'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('throws when delete returns error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      await expect(client.deleteFile('protected.pdf')).rejects.toThrow('S3 delete failed');
    });
  });
});
