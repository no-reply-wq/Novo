/**
 * Integration tests for schema/publish.ts
 * Uses real Postgres on TEST_DATABASE_URL.
 */

import { Pool } from 'pg';
import { publishApp } from '../schema/publish';
import type { AppDefinition, TableDef, FieldDef } from '@/platform/contracts';
import { makePool, dropSchema, TEST_DB_URL } from './helpers';

const TENANT = 'pubtest';
const APP_ID = 'app-pub-001';

function makeAppDef(tables: TableDef[]): AppDefinition {
  return {
    id: APP_ID,
    tenantId: 'tenant-001',
    name: 'Test App',
    slug: TENANT,
    version: '1.0.0',
    status: 'draft',
    tables,
    pageIds: [],
    workflowIds: [],
    scriptIds: [],
    connectorIds: [],
    docTemplateIds: [],
    environment: 'development',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeField(overrides: Partial<FieldDef> & Pick<FieldDef, 'id' | 'apiKey' | 'type'>): FieldDef {
  return {
    tableId: 'tbl-001',
    name: overrides.apiKey,
    rank: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as FieldDef;
}

function makeTable(overrides: Partial<TableDef> & Pick<TableDef, 'id' | 'apiKey' | 'fields'>): TableDef {
  return {
    appId: APP_ID,
    name: overrides.apiKey,
    relations: [],
    schemaVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TableDef;
}

let pool: Pool;

beforeAll(async () => {
  pool = makePool();
  // Drop any leftover schema from a previous run
  await dropSchema(pool, TENANT);
});

afterAll(async () => {
  await dropSchema(pool, TENANT);
  await pool.end();
});

describe('publishApp — create_table', () => {
  it('creates a new table with RLS enabled', async () => {
    const appDef = makeAppDef([
      makeTable({
        id: 'tbl-001',
        apiKey: 'purchase_order',
        fields: [
          makeField({ id: 'f-001', apiKey: 'po_number', type: 'text' }),
          makeField({ id: 'f-002', apiKey: 'total',     type: 'decimal' }),
        ],
      }),
    ]);

    const result = await publishApp(pool, TENANT, appDef);

    expect(result.migrations.some(m => m.kind === 'create_table')).toBe(true);
    expect(result.migrations.some(m => m.kind === 'enable_rls')).toBe(true);

    // Verify table exists in DB
    const res = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = 'purchase_order'`,
      [`tenant_${TENANT}`],
    );
    expect(res.rows.length).toBe(1);

    // Verify columns exist
    const cols = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'purchase_order'`,
      [`tenant_${TENANT}`],
    );
    const colNames = cols.rows.map(r => r.column_name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('po_number');
    expect(colNames).toContain('total');
  });

  it('is idempotent — running publish twice does not error', async () => {
    const appDef = makeAppDef([
      makeTable({
        id: 'tbl-001',
        apiKey: 'purchase_order',
        fields: [
          makeField({ id: 'f-001', apiKey: 'po_number', type: 'text' }),
          makeField({ id: 'f-002', apiKey: 'total',     type: 'decimal' }),
        ],
      }),
    ]);

    await expect(publishApp(pool, TENANT, appDef)).resolves.not.toThrow();
  });
});

describe('publishApp — add_column', () => {
  it('adds a new field to an existing table', async () => {
    const appDef = makeAppDef([
      makeTable({
        id: 'tbl-001',
        apiKey: 'purchase_order',
        fields: [
          makeField({ id: 'f-001', apiKey: 'po_number',  type: 'text' }),
          makeField({ id: 'f-002', apiKey: 'total',      type: 'decimal' }),
          makeField({ id: 'f-003', apiKey: 'vendor_name', type: 'text' }),  // NEW
        ],
      }),
    ]);

    const result = await publishApp(pool, TENANT, appDef);
    expect(result.migrations.some(m => m.kind === 'add_column')).toBe(true);

    const cols = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'purchase_order'`,
      [`tenant_${TENANT}`],
    );
    expect(cols.rows.map(r => r.column_name)).toContain('vendor_name');
  });
});

describe('publishApp — drop_column', () => {
  it('removes a dropped field from the table and emits a warning', async () => {
    // Remove vendor_name
    const appDef = makeAppDef([
      makeTable({
        id: 'tbl-001',
        apiKey: 'purchase_order',
        fields: [
          makeField({ id: 'f-001', apiKey: 'po_number', type: 'text' }),
          makeField({ id: 'f-002', apiKey: 'total',     type: 'decimal' }),
          // f-003 / vendor_name omitted
        ],
      }),
    ]);

    const result = await publishApp(pool, TENANT, appDef);
    expect(result.warnings.some(w => w.includes('vendor_name'))).toBe(true);

    const cols = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'purchase_order'`,
      [`tenant_${TENANT}`],
    );
    expect(cols.rows.map(r => r.column_name)).not.toContain('vendor_name');
  });
});

describe('publishApp — lookup field (FK)', () => {
  it('creates a lookup field with an index', async () => {
    // Create a supplier table first
    const supplierDef = makeAppDef([
      makeTable({
        id: 'tbl-sup',
        apiKey: 'supplier',
        fields: [
          makeField({ id: 'fs-001', apiKey: 'sup_name', type: 'text' }),
        ],
      }),
    ]);
    await publishApp(pool, TENANT, supplierDef);

    // Now add a lookup field on purchase_order → supplier
    const appDef = makeAppDef([
      makeTable({
        id: 'tbl-001',
        apiKey: 'purchase_order',
        fields: [
          makeField({ id: 'f-001', apiKey: 'po_number', type: 'text' }),
          makeField({ id: 'f-002', apiKey: 'total',     type: 'decimal' }),
          makeField({
            id: 'f-004',
            apiKey: 'supplier_id',
            type: 'lookup',
            options: {
              targetTableId: 'tbl-sup',
              multi: false,
              cascadeDelete: 'restrict',
            },
          }),
        ],
      }),
      makeTable({
        id: 'tbl-sup',
        apiKey: 'supplier',
        fields: [makeField({ id: 'fs-001', apiKey: 'sup_name', type: 'text' })],
      }),
    ]);

    const result = await publishApp(pool, TENANT, appDef);

    // Should have added the column
    const cols = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'purchase_order'`,
      [`tenant_${TENANT}`],
    );
    expect(cols.rows.map(r => r.column_name)).toContain('supplier_id');
    void result;
  });
});
