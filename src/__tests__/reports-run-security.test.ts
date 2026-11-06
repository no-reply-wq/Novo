/**
 * Attack tests for POST /api/platform/reports/run
 * Uses mocked DB/auth to verify the route rejects malicious inputs
 * before anything reaches the database.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/tenant-session', () => ({
  requirePermission: jest.fn().mockResolvedValue({
    schemaName: 'tenant_test',
    tenantSlug: 'test',
    userId: 'user-1',
  }),
}));

jest.mock('@/lib/db/client', () => ({
  tenantQuery: jest.fn().mockResolvedValue({ rows: [] }),
}));

// eslint-disable-next-line import/first -- mocks must come first
import { POST } from '@/app/api/platform/reports/run/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/platform/reports/run?tenant=test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/platform/reports/run — SQL injection attacks', () => {
  describe('table_slug validation', () => {
    const maliciousTableSlugs = [
      "users'; DROP TABLE tenants; --",
      'USERS',
      '" OR 1=1 --',
      '../pg_user',
      'users UNION SELECT * FROM pg_shadow',
      '1_invalid',
      '',
      'table name',
      'table;injection',
    ];

    test.each(maliciousTableSlugs)('rejects table_slug: %j', async (slug) => {
      const res = await POST(makeRequest({ table_slug: slug }));
      expect(res.status).toBe(400);
    });

    it('accepts valid table_slug', async () => {
      const res = await POST(makeRequest({ table_slug: 'customers' }));
      expect(res.status).toBe(200);
    });
  });

  describe('group_by validation', () => {
    it('rejects UNION injection in group_by', async () => {
      const res = await POST(makeRequest({
        table_slug: 'customers',
        group_by: 'name UNION SELECT * FROM users',
      }));
      expect(res.status).toBe(400);
    });

    it('rejects uppercase group_by', async () => {
      const res = await POST(makeRequest({
        table_slug: 'customers',
        group_by: 'Name',
      }));
      expect(res.status).toBe(400);
    });

    it('accepts valid group_by', async () => {
      const res = await POST(makeRequest({
        table_slug: 'customers',
        group_by: 'status',
        columns: [{ field_slug: 'amount', aggregate: 'sum', label: 'Total' }],
      }));
      expect(res.status).toBe(200);
    });
  });

  describe('sort_by validation — falls back safely on bad input', () => {
    const badSortFields = [
      '; DROP TABLE users',
      'name UNION SELECT 1',
      'col()',
      'Col',
    ];

    // sort_by falls back to created_at when invalid — should NOT error or concatenate
    test.each(badSortFields)('falls back for sort_by: %j', async (sortBy) => {
      const res = await POST(makeRequest({
        table_slug: 'customers',
        sort_by: sortBy,
      }));
      // Should succeed (200) with fallback sort, not 500 from SQL error
      expect(res.status).toBe(200);
      // And must not have included the raw injection in the response
      const body = await res.json() as { query?: string };
      if (body.query) {
        expect(body.query).not.toContain(sortBy);
      }
    });
  });

  describe('column field_slug validation', () => {
    it('skips columns with invalid field_slug (no crash, no injection)', async () => {
      const res = await POST(makeRequest({
        table_slug: 'customers',
        columns: [
          { field_slug: "name'; DROP TABLE users; --", aggregate: 'none', label: 'Attack' },
          { field_slug: 'name', aggregate: 'none', label: 'Name' },
        ],
      }));
      // Route should handle gracefully — either 200 (skips bad col) or 400
      expect([200, 400]).toContain(res.status);
    });
  });

  describe('filter operator validation', () => {
    it('skips filters with unknown operator', async () => {
      const res = await POST(makeRequest({
        table_slug: 'customers',
        filters: [
          { field_slug: 'name', operator: 'UNION SELECT', value: 'x' },
        ],
      }));
      // Unknown operator is skipped, not injected
      expect(res.status).toBe(200);
    });

    it('skips filters with invalid field_slug', async () => {
      const res = await POST(makeRequest({
        table_slug: 'customers',
        filters: [
          { field_slug: "name'; --", operator: '=', value: 'test' },
        ],
      }));
      expect(res.status).toBe(200);
    });
  });

  describe('row_limit is capped', () => {
    it('never executes with LIMIT > 1000 even if 999999 is passed', async () => {
      const { tenantQuery } = jest.requireMock('@/lib/db/client') as {
        tenantQuery: jest.Mock;
      };
      tenantQuery.mockClear();

      await POST(makeRequest({ table_slug: 'customers', row_limit: 999999 }));

      expect(tenantQuery).toHaveBeenCalled();
      const [, sql] = tenantQuery.mock.calls[0] as [string, string, unknown[]];
      // The LIMIT value in the query should be 1000, not 999999
      expect(sql).toMatch(/LIMIT \$\d+/);
      const [, , params] = tenantQuery.mock.calls[0] as [string, string, unknown[]];
      const limitParam = (params as unknown[]).at(-1);
      expect(limitParam).toBeLessThanOrEqual(1000);
    });
  });
});
