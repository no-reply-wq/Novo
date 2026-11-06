/**
 * Tests for the BigQuery reader.
 * Mocks: pgPool, fetch, getAccessToken.
 */

jest.mock('@/lib/db/client', () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock('../../secrets', () => ({
  decryptSecret: (_enc: string, _tenant: string) =>
    JSON.stringify({
      type: 'service_account',
      project_id: 'my-project',
      private_key_id: 'k1',
      private_key: 'FAKE',
      client_email: 'sa@my-project.iam.gserviceaccount.com',
      client_id: '1',
      auth_uri: '',
      token_uri: '',
    }),
}));

jest.mock('../../sheets/auth', () => ({
  getAccessToken: jest.fn().mockResolvedValue('bq-token'),
}));

import { pgPool } from '@/lib/db/client';
import { runBigQuerySQL, listBigQueryDatasets, listBigQueryTables } from '../reader';

const mockPgQuery = pgPool.query as jest.Mock;

const SA_CONFIG = {
  rows: [{ config: { serviceAccountJson: 'enc' } }],
};

function makeFetchMock(...responses: object[]) {
  let call = 0;
  return jest.fn().mockImplementation(() => {
    const resp = responses[call++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(resp),
      text: () => Promise.resolve(JSON.stringify(resp)),
    });
  });
}

describe('runBigQuerySQL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPgQuery.mockResolvedValue(SA_CONFIG);
  });

  it('throws NotConfiguredError when no integration found', async () => {
    mockPgQuery.mockResolvedValue({ rows: [] });
    await expect(
      runBigQuerySQL({ tenantSlug: 'x', sql: 'SELECT 1' })
    ).rejects.toThrow('No enabled BigQuery integration');
  });

  it('creates a job and fetches results', async () => {
    global.fetch = makeFetchMock(
      // 1. Create job — already DONE
      {
        jobReference: { jobId: 'job1', projectId: 'my-project' },
        status: { state: 'DONE' },
      },
      // 2. Fetch results
      {
        jobComplete: true,
        schema: { fields: [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'STRING' }] },
        rows: [
          { f: [{ v: '1' }, { v: 'Alice' }] },
          { f: [{ v: '2' }, { v: 'Bob' }] },
        ],
        totalRows: '2',
      }
    );

    const result = await runBigQuerySQL({ tenantSlug: 'tenant1', sql: 'SELECT id, name FROM t' });

    expect(result.columns).toEqual(['id', 'name']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ id: 1, name: 'Alice' });
    expect(result.rows[1]).toEqual({ id: 2, name: 'Bob' });
    expect(result.totalRows).toBe(2);
  });

  it('polls until job is DONE', async () => {
    let call = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      call++;
      if (call === 1) {
        // Create job — RUNNING
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            jobReference: { jobId: 'job2', projectId: 'my-project' },
            status: { state: 'RUNNING' },
          }),
        });
      } else if (call === 2) {
        // Poll — DONE
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: { state: 'DONE' } }),
        });
      } else {
        // Results
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            jobComplete: true,
            schema: { fields: [{ name: 'n', type: 'INTEGER' }] },
            rows: [{ f: [{ v: '42' }] }],
            totalRows: '1',
          }),
        });
      }
    });

    const result = await runBigQuerySQL({ tenantSlug: 'tenant1', sql: 'SELECT 42 AS n' });
    expect(result.rows[0]).toEqual({ n: 42 });
  });

  it('throws when job fails', async () => {
    global.fetch = makeFetchMock(
      {
        jobReference: { jobId: 'j3', projectId: 'my-project' },
        status: { state: 'DONE', errorResult: { message: 'Syntax error' } },
      }
    );

    await expect(
      runBigQuerySQL({ tenantSlug: 'tenant1', sql: 'BAD SQL' })
    ).rejects.toThrow('Syntax error');
  });

  it('maps BOOLEAN values correctly', async () => {
    global.fetch = makeFetchMock(
      { jobReference: { jobId: 'j4', projectId: 'my-project' }, status: { state: 'DONE' } },
      {
        jobComplete: true,
        schema: { fields: [{ name: 'active', type: 'BOOLEAN' }] },
        rows: [{ f: [{ v: 'true' }] }, { f: [{ v: 'false' }] }],
        totalRows: '2',
      }
    );

    const result = await runBigQuerySQL({ tenantSlug: 'tenant1', sql: 'SELECT active FROM t' });
    expect(result.rows[0]).toEqual({ active: true });
    expect(result.rows[1]).toEqual({ active: false });
  });

  it('maps null values', async () => {
    global.fetch = makeFetchMock(
      { jobReference: { jobId: 'j5', projectId: 'my-project' }, status: { state: 'DONE' } },
      {
        jobComplete: true,
        schema: { fields: [{ name: 'val', type: 'STRING' }] },
        rows: [{ f: [{ v: null }] }],
        totalRows: '1',
      }
    );

    const result = await runBigQuerySQL({ tenantSlug: 't', sql: 'SELECT val FROM t' });
    expect(result.rows[0]).toEqual({ val: null });
  });

  it('returns empty results for no rows', async () => {
    global.fetch = makeFetchMock(
      { jobReference: { jobId: 'j6', projectId: 'my-project' }, status: { state: 'DONE' } },
      {
        jobComplete: true,
        schema: { fields: [{ name: 'x', type: 'INTEGER' }] },
        totalRows: '0',
      }
    );

    const result = await runBigQuerySQL({ tenantSlug: 't', sql: 'SELECT x FROM t WHERE 1=0' });
    expect(result.rows).toHaveLength(0);
    expect(result.totalRows).toBe(0);
  });
});

describe('listBigQueryDatasets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPgQuery.mockResolvedValue(SA_CONFIG);
  });

  it('returns dataset IDs', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        datasets: [
          { datasetReference: { datasetId: 'sales' } },
          { datasetReference: { datasetId: 'inventory' } },
        ],
      }),
    });

    const result = await listBigQueryDatasets({ tenantSlug: 'tenant1' });
    expect(result).toEqual(['sales', 'inventory']);
  });
});

describe('listBigQueryTables', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPgQuery.mockResolvedValue(SA_CONFIG);
  });

  it('returns table IDs for a dataset', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        tables: [
          { tableReference: { tableId: 'orders' } },
          { tableReference: { tableId: 'customers' } },
        ],
      }),
    });

    const result = await listBigQueryTables({ tenantSlug: 'tenant1', datasetId: 'sales' });
    expect(result).toEqual(['orders', 'customers']);
  });
});
