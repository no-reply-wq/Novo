/**
 * Storage client tests — mocks @aws-sdk/client-s3 and lib/storage.
 */

jest.mock('../../lib/db/client', () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock('../../platform/integrations/secrets/store', () => ({
  getSecretValue: jest.fn().mockImplementation(async (ref: { secretId: string }) => {
    if (ref.secretId === 'sec-access-key') return 'AKIAIOSFODNN7EXAMPLE';
    if (ref.secretId === 'sec-secret-key') return 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    return '';
  }),
}));

// Mock lib/storage which is used by StorageClient
jest.mock("../../platform/integrations/storage/validation", () => ({
  validateFileType: jest.fn(),
}));

jest.mock("../../lib/storage", () => ({
  uploadFile: jest.fn().mockResolvedValue('https://bucket.s3.us-east-1.amazonaws.com/uploads/file.pdf'),
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/signed-download'),
  presignUrl: jest.fn().mockReturnValue('https://s3.example.com/presigned-put'),
}));

import { pgPool } from '../../lib/db/client';
import { StorageClient } from '../../platform/integrations/storage/client';
import type { ConnectorDef } from '../../platform/contracts';

const mockPool = pgPool as jest.Mocked<typeof pgPool>;

const s3Connector: ConnectorDef = {
  id: 'conn-s3-1',
  appId: 'app-1',
  name: 'AWS S3',
  kind: 'aws_s3',
  secrets: {
    accessKeyId: { secretId: 'sec-access-key' },
    secretAccessKey: { secretId: 'sec-secret-key' },
  },
  storage: {
    bucket: 'my-test-bucket',
    region: 'us-east-1',
  },
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('StorageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ data: s3Connector }] });
  });

  it('creates a StorageClient from a connectorId', async () => {
    const client = await StorageClient.fromConnectorId('conn-s3-1');
    expect(client).toBeInstanceOf(StorageClient);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('connector_defs'),
      ['conn-s3-1'],
    );
  });

  it('throws if connector is not found', async () => {
    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    await expect(StorageClient.fromConnectorId('nonexistent')).rejects.toThrow('not found');
  });

  it('calls presignUrl for upload', async () => {
    const { presignUrl } = await import('../../lib/storage');
    const client = await StorageClient.fromConnectorId('conn-s3-1');
    // upload triggers a presign internally
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;
    // presignUrl is mocked; just verify it's called on upload
    await client.upload(Buffer.from('file-data'), 'application/pdf', 'uploads/file.pdf');
    expect(presignUrl).toHaveBeenCalled();
  });

  it('generates presigned download URL', async () => {
    const { presignUrl } = await import('../../lib/storage');
    const client = await StorageClient.fromConnectorId('conn-s3-1');
    const url = await client.getPresignedDownloadUrl('uploads/file.pdf', 3600);
    expect(presignUrl).toHaveBeenCalled();
    expect(typeof url).toBe('string');
  });
});
