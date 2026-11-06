/**
 * Tests for the packaging exporter.
 * Uses a mock PoolClient — no real database needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportApp } from '../exporter';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeQueryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  } as QueryResult<T>;
}

function makeQueryMock(overrides: Record<string, unknown[]> = {}): PoolClient['query'] {
  const fn = async (sql: string, _params?: unknown[]) => {
    const lower = sql.toLowerCase();

    if (lower.includes('from public.apps') && overrides.app) {
      return makeQueryResult(overrides.app as QueryResultRow[]);
    }
    if (lower.includes('from platform.tables')) {
      return makeQueryResult((overrides.tables ?? []) as QueryResultRow[]);
    }
    if (lower.includes('from platform.table_relations')) {
      return makeQueryResult((overrides.relations ?? []) as QueryResultRow[]);
    }
    if (lower.includes('from platform.child_table_configs')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.pages')) {
      return makeQueryResult((overrides.pages ?? []) as QueryResultRow[]);
    }
    if (lower.includes('from platform.nav_items')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.themes')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.workflows')) {
      return makeQueryResult((overrides.workflows ?? []) as QueryResultRow[]);
    }
    if (lower.includes('from platform.approval_flows')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.workflow_schedules')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.table_access_rules')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.field_permissions')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.scripts')) {
      return makeQueryResult((overrides.scripts ?? []) as QueryResultRow[]);
    }
    if (lower.includes('from platform.pdf_templates')) {
      return makeQueryResult((overrides.pdfTemplates ?? []) as QueryResultRow[]);
    }
    if (lower.includes('from platform.email_templates')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.stock_configs')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.fulfilment_configs')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.convert_to_configs')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.bom_headers')) {
      return makeQueryResult([]);
    }
    if (lower.includes('from platform.rest_connectors')) {
      return makeQueryResult((overrides.restConnectors ?? []) as QueryResultRow[]);
    }

    return makeQueryResult([]);
  };
  return fn as unknown as PoolClient['query'];
}

function fakeAppRow() {
  return {
    id: 'app-id-1',
    tenant_slug: 'acme',
    name: 'Test App',
    slug: 'test-app',
    description: 'A test app',
    icon: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-02'),
  };
}

function fakeTableRow(id = 'tbl-1', name = 'Contacts') {
  return {
    id,
    app_id: 'app-id-1',
    config: { slug: 'contacts', name, fields: [{ id: 'f1', name: 'Name' }], indexes: [] },
  };
}

function fakePageRow(id = 'pg-1') {
  return { id, app_id: 'app-id-1', config: { title: 'Home' }, slug: 'home' };
}

function fakeScriptRow(id = 'scr-1') {
  return {
    id,
    app_id: 'app-id-1',
    name: 'send-email',
    code: 'async function run() {}',
    input_schema: [{ name: 'to', type: 'string' }],
    output_schema: [],
    test_cases: [],
  };
}

function makeClient(overrides: Record<string, unknown[]> = {}): PoolClient {
  const query = makeQueryMock(overrides);
  return { query, release: vi.fn() } as unknown as PoolClient;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('exportApp', () => {
  it('throws if app not found', async () => {
    const client = makeClient({ app: [] });
    await expect(exportApp('no-app', 'acme', client)).rejects.toThrow('not found');
  });

  it('exports all tables', async () => {
    const client = makeClient({
      app: [fakeAppRow()],
      tables: [fakeTableRow('t1', 'Contacts'), fakeTableRow('t2', 'Deals')],
    });
    const bundle = await exportApp('app-id-1', 'acme', client);
    expect(bundle.schema.tables).toHaveLength(2);
    expect(bundle.schema.tables.map(t => t.name)).toEqual(['Contacts', 'Deals']);
  });

  it('exports all pages', async () => {
    const client = makeClient({
      app: [fakeAppRow()],
      pages: [fakePageRow('pg-1'), fakePageRow('pg-2')],
    });
    const bundle = await exportApp('app-id-1', 'acme', client);
    expect(bundle.ui.pages).toHaveLength(2);
  });

  it('exports scripts with code', async () => {
    const client = makeClient({
      app: [fakeAppRow()],
      scripts: [fakeScriptRow()],
    });
    const bundle = await exportApp('app-id-1', 'acme', client);
    expect(bundle.scripts).toHaveLength(1);
    expect(bundle.scripts[0].code).toBe('async function run() {}');
  });

  it('excludes secrets from REST connectors', async () => {
    const client = makeClient({
      app: [fakeAppRow()],
      restConnectors: [
        { id: 'conn-1', app_id: 'app-id-1', name: 'Stripe', base_url: 'https://api.stripe.com', config: { apiKeyName: 'STRIPE_KEY' } },
      ],
    });
    const bundle = await exportApp('app-id-1', 'acme', client);
    const conn = bundle.integrations.restConnectors[0] as { _secretsExcluded?: boolean; config?: unknown };
    // config may contain key names but should NOT contain secret values
    expect(conn._secretsExcluded).toBe(true);
    // The raw secret value should not appear
    const bundleJson = JSON.stringify(bundle);
    expect(bundleJson).not.toContain('sk_live_');
  });

  it('bundle round-trips through JSON', async () => {
    const client = makeClient({
      app: [fakeAppRow()],
      tables: [fakeTableRow()],
      pages: [fakePageRow()],
      scripts: [fakeScriptRow()],
    });
    const bundle = await exportApp('app-id-1', 'acme', client);
    const json = JSON.stringify(bundle);
    const parsed = JSON.parse(json) as typeof bundle;
    expect(parsed.app.name).toBe(bundle.app.name);
    expect(parsed.schema.tables).toHaveLength(bundle.schema.tables.length);
    expect(parsed.scripts).toHaveLength(bundle.scripts.length);
  });

  it('version string is valid semver', async () => {
    const client = makeClient({ app: [fakeAppRow()] });
    const bundle = await exportApp('app-id-1', 'acme', client);
    // semver: X.Y.Z
    expect(bundle.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exportedAt is a valid ISO date', async () => {
    const client = makeClient({ app: [fakeAppRow()] });
    const bundle = await exportApp('app-id-1', 'acme', client);
    expect(() => new Date(bundle.exportedAt)).not.toThrow();
    expect(new Date(bundle.exportedAt).toISOString()).toBe(bundle.exportedAt);
  });

  it('includes exportedBy in bundle', async () => {
    const client = makeClient({ app: [fakeAppRow()] });
    const bundle = await exportApp('app-id-1', 'acme', client, 'user-42');
    expect(bundle.exportedBy).toBe('user-42');
  });

  it('tables include fields array', async () => {
    const client = makeClient({
      app: [fakeAppRow()],
      tables: [fakeTableRow()],
    });
    const bundle = await exportApp('app-id-1', 'acme', client);
    expect(Array.isArray(bundle.schema.tables[0].fields)).toBe(true);
    expect(bundle.schema.tables[0].fields).toHaveLength(1);
  });
});
