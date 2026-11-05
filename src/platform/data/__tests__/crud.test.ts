/**
 * Integration tests for crud.ts
 */

import { Pool } from 'pg';
import { publishApp } from '../schema/publish';
import {
  insertRecord,
  updateRecord,
  deleteRecord,
  queryRecords,
  getRecord,
} from '../crud';
import { makePool, dropSchema, noopExprEngine, makeSimpleExprEngine } from './helpers';
import { LockError, ValidationError } from '../errors';
import type { AppDefinition, TableDef, FieldDef } from '@/platform/contracts';

const TENANT = 'crudtest';
const APP_ID = 'app-crud-001';

function makeCtx() {
  return {
    userId: '00000000-0000-0000-0000-000000000001',
    claims: {
      userId: '00000000-0000-0000-0000-000000000001',
      roles: ['admin'],
      locations: [],
    },
  };
}

const orderTableDef: TableDef = {
  id: 'tbl-order',
  appId: APP_ID,
  name: 'Order',
  apiKey: 'order',
  fields: [
    {
      id: 'f-name',
      tableId: 'tbl-order',
      name: 'Name',
      apiKey: 'name',
      type: 'text',
      required: true,
      rank: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'f-qty',
      tableId: 'tbl-order',
      name: 'Qty',
      apiKey: 'qty',
      type: 'integer',
      rank: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'f-status',
      tableId: 'tbl-order',
      name: 'Status',
      apiKey: 'status',
      type: 'dropdown',
      rank: 2,
      lockWhen: "status = 'Approved'",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as FieldDef[],
  relations: [],
  schemaVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const appDef: AppDefinition = {
  id: APP_ID,
  tenantId: 'tenant-001',
  name: 'Test',
  slug: TENANT,
  version: '1.0.0',
  status: 'draft',
  tables: [orderTableDef],
  pageIds: [],
  workflowIds: [],
  scriptIds: [],
  connectorIds: [],
  docTemplateIds: [],
  environment: 'development',
  createdAt: new Date(),
  updatedAt: new Date(),
};

let pool: Pool;

beforeAll(async () => {
  pool = makePool();
  await dropSchema(pool, TENANT);
  await publishApp(pool, TENANT, appDef);
});

afterAll(async () => {
  await dropSchema(pool, TENANT);
  await pool.end();
});

describe('insertRecord', () => {
  it('inserts a valid record and returns it', async () => {
    const rec = await insertRecord(pool, TENANT, orderTableDef, { name: 'PO-1', qty: 10 }, makeCtx(), noopExprEngine);
    expect(rec['id']).toBeTruthy();
    expect(rec['name']).toBe('PO-1');
    expect(rec['qty']).toBe('10'); // pg returns bigint as string
  });

  it('throws ValidationError when required field is missing', async () => {
    await expect(
      insertRecord(pool, TENANT, orderTableDef, { qty: 5 }, makeCtx(), noopExprEngine),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('updateRecord', () => {
  it('updates a field on an existing record', async () => {
    const rec = await insertRecord(pool, TENANT, orderTableDef, { name: 'PO-2', qty: 1 }, makeCtx(), noopExprEngine);
    const id = String(rec['id']);

    const updated = await updateRecord(pool, TENANT, orderTableDef, id, { qty: 99 }, makeCtx(), noopExprEngine);
    expect(updated['qty']).toBe('99');
  });

  it('throws LockError when record is locked by lockWhen expression', async () => {
    const rec = await insertRecord(pool, TENANT, orderTableDef, { name: 'PO-Lock', status: 'Approved' }, makeCtx(), noopExprEngine);
    const id = String(rec['id']);

    await expect(
      updateRecord(pool, TENANT, orderTableDef, id, { qty: 5 }, makeCtx(), makeSimpleExprEngine()),
    ).rejects.toBeInstanceOf(LockError);
  });
});

describe('deleteRecord', () => {
  it('hard-deletes a record when softDelete is not configured', async () => {
    const rec = await insertRecord(pool, TENANT, orderTableDef, { name: 'PO-Del', qty: 1 }, makeCtx(), noopExprEngine);
    const id = String(rec['id']);

    await deleteRecord(pool, TENANT, orderTableDef, id, makeCtx(), noopExprEngine);

    const fetched = await getRecord(pool, TENANT, orderTableDef, id, makeCtx());
    expect(fetched).toBeNull();
  });
});

describe('queryRecords', () => {
  beforeAll(async () => {
    // Insert several records for pagination test
    for (let i = 0; i < 5; i++) {
      await insertRecord(pool, TENANT, orderTableDef, { name: `PAGE-${i}`, qty: i }, makeCtx(), noopExprEngine);
    }
  });

  it('returns all records with correct total', async () => {
    const page = await queryRecords(pool, TENANT, orderTableDef, [], [], {}, makeCtx());
    expect(page.total).toBeGreaterThanOrEqual(5);
    expect(page.items.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by field value', async () => {
    const page = await queryRecords(
      pool, TENANT, orderTableDef,
      [{ field: 'name', op: 'eq', value: 'PAGE-3' }],
      [],
      {},
      makeCtx(),
    );
    expect(page.items.length).toBe(1);
    expect(page.items[0]['name']).toBe('PAGE-3');
  });

  it('paginates using cursor', async () => {
    const page1 = await queryRecords(pool, TENANT, orderTableDef, [], [{ field: 'id', dir: 'asc' }], { limit: 2 }, makeCtx());
    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await queryRecords(
      pool, TENANT, orderTableDef, [], [{ field: 'id', dir: 'asc' }],
      { limit: 2, after: page1.nextCursor! },
      makeCtx(),
    );
    expect(page2.items.length).toBeGreaterThanOrEqual(1);
    // Items should not overlap
    const ids1 = new Set(page1.items.map(r => String(r['id'])));
    const ids2 = page2.items.map(r => String(r['id']));
    ids2.forEach(id => expect(ids1.has(id)).toBe(false));
  });
});

describe('getRecord', () => {
  it('returns null for a non-existent record', async () => {
    const result = await getRecord(pool, TENANT, orderTableDef, '00000000-0000-0000-0000-000000000000', makeCtx());
    expect(result).toBeNull();
  });
});
