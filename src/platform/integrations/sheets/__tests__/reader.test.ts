/**
 * Tests for the Sheets reader.
 * Mocks: pgPool, fetch, and the auth module.
 */

jest.mock('@/lib/db/client', () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock('../../secrets', () => ({
  decryptSecret: (_enc: string, _tenant: string) => JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    private_key_id: 'key123',
    private_key: 'FAKE_KEY',
    client_email: 'sa@test.iam.gserviceaccount.com',
    client_id: '12345',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  }),
}));

jest.mock('../auth', () => ({
  getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
}));

import { pgPool } from '@/lib/db/client';
import { readSheet, listSheets } from '../reader';
import { getAccessToken } from '../auth';

const mockPgQuery = pgPool.query as jest.Mock;
const mockGetAccessToken = getAccessToken as jest.Mock;

const SA_CONFIG = {
  rows: [{ config: { serviceAccountJson: 'encrypted-json' } }],
};

describe('readSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPgQuery.mockResolvedValue(SA_CONFIG);
    global.fetch = jest.fn();
  });

  it('throws NotConfiguredError when no integration found', async () => {
    mockPgQuery.mockResolvedValue({ rows: [] });
    await expect(
      readSheet({ tenantSlug: 'x', spreadsheetId: 'sid' })
    ).rejects.toThrow('No enabled Sheets integration');
  });

  it('obtains an access token from service account', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ values: [['A', 'B'], ['1', '2']] }),
    });

    await readSheet({ tenantSlug: 'tenant1', spreadsheetId: 'spreadsheet123' });
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
  });

  it('calls Sheets API with Bearer token', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ values: [['Name', 'Age'], ['Alice', '30']] }),
    });

    await readSheet({ tenantSlug: 'tenant1', spreadsheetId: 'sid1' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sheets.googleapis.com'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer mock-access-token' }),
      })
    );
  });

  it('parses first row as headers and rest as records', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        values: [
          ['Name', 'Email', 'Age'],
          ['Alice', 'alice@test.com', '30'],
          ['Bob', 'bob@test.com', '25'],
        ],
      }),
    });

    const result = await readSheet({ tenantSlug: 't', spreadsheetId: 's' });
    expect(result.headers).toEqual(['Name', 'Email', 'Age']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ Name: 'Alice', Email: 'alice@test.com', Age: '30' });
    expect(result.rows[1]).toEqual({ Name: 'Bob', Email: 'bob@test.com', Age: '25' });
  });

  it('returns empty headers and rows for an empty sheet', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ values: [] }),
    });

    const result = await readSheet({ tenantSlug: 't', spreadsheetId: 's' });
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('uses sheetName in the range when provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ values: [['Col']] }),
    });

    await readSheet({ tenantSlug: 't', spreadsheetId: 's', sheetName: 'Orders' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('Orders'),
      expect.any(Object)
    );
  });

  it('throws on API error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await expect(
      readSheet({ tenantSlug: 't', spreadsheetId: 's' })
    ).rejects.toThrow('403');
  });
});

describe('listSheets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPgQuery.mockResolvedValue(SA_CONFIG);
    global.fetch = jest.fn();
  });

  it('returns sheet names from API', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        sheets: [
          { properties: { title: 'Leads' } },
          { properties: { title: 'Orders' } },
        ],
      }),
    });

    const names = await listSheets({ tenantSlug: 't', spreadsheetId: 's' });
    expect(names).toEqual(['Leads', 'Orders']);
  });

  it('returns empty array when sheets property missing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const names = await listSheets({ tenantSlug: 't', spreadsheetId: 's' });
    expect(names).toEqual([]);
  });
});
