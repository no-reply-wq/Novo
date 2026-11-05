/**
 * Integration tests for audit.ts
 */

import { Pool } from 'pg';
import { publishApp } from '../schema/publish';
import { insertRecord, updateRecord } from '../crud';
import { getRecordHistory, buildDiff } from '../audit';
import { makePool, dropSchema, noopExprEngine } from './helpers';
import type { AppDefinition, TableDef, FieldDef } from '@/platform/contracts';

const TENANT = 'audittest';
const APP_ID  = 'app-audit-001';

const auditTableDef: TableDef = {
  id: 'tbl-audit',
  appId: APP_ID,
  name: 'Item',
  apiKey: 'item',
  fields: [
    {
      id: 'fa-name',
      tableId: 'tbl-audit',
      name: 'Name',
      apiKey: 'name',
      type: 'text',
      required: true,
      rank: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FieldDef,
    {
      id: 'fa-price',
      tableId: 'tbl-audit',
      name: 'Price',
      apiKey: 'price',
      type: 'decimal',
      rank: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FieldDef,
  ],
  relations: [],
  schemaVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const appDef: AppDefinition = {
  id: APP_ID,
  tenantId: 't-001',
  name: 'Audit Test',
  slug: TENANT,
  version: '1.0.0',
  status: 'draft',
  tables: [auditTableDef],
  pageIds: [],
  workflowIds: [],
  scriptIds: [],
  connectorIds: [],
  docTemplateIds: [],
  environment: 'development',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ctx = {
  userId: '00000000-0000-0000-0000-000000000099',
  claims: {
    userId: '00000000-0000-0000-0000-000000000099',
    roles: ['admin'],
    locations: [],
  },
};

let pool: Pool;
let recordId: string;

beforeAll(async () => {
  pool = makePool();
  await dropSchema(pool, TENANT);
  await publishApp(pool, TENANT, appDef);

  // Insert a record
  const rec = await insertRecord(pool, TENANT, auditTableDef, { name: 'Widget', price: 9.99 }, ctx, noopExprEngine);
  recordId = String(rec['id']);
});

afterAll(async () => {
  await dropSchema(pool, TENANT);
  await pool.end();
});

describe('audit log', () => {
  it('records an INSERT entry when a record is inserted', async () => {
    const history = await getRecordHistory(pool, `tenant_${TENANT}`, 'item', recordId);
    const insertEntry = history.find(e => e.action === 'INSERT');
    expect(insertEntry).toBeTruthy();
    expect(insertEntry!.userId).toBe(ctx.userId);
  });

  it('records an UPDATE entry with field-level diff', async () => {
    await updateRecord(pool, TENANT, auditTableDef, recordId, { price: 19.99 }, ctx, noopExprEngine);

    const history = await getRecordHistory(pool, `tenant_${TENANT}`, 'item', recordId);
    const updateEntry = history.find(e => e.action === 'UPDATE');
    expect(updateEntry).toBeTruthy();
    expect(updateEntry!.diff['price']).toBeDefined();
    expect(Number(updateEntry!.diff['price'].after)).toBeCloseTo(19.99, 1);
  });

  it('history is ordered newest first', async () => {
    const history = await getRecordHistory(pool, `tenant_${TENANT}`, 'item', recordId);
    expect(history.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1].createdAt >= history[i].createdAt).toBe(true);
    }
  });
});

describe('buildDiff', () => {
  it('only includes changed fields', () => {
    const before = { name: 'A', price: 1, unchanged: 'x' };
    const after  = { name: 'B', price: 1, unchanged: 'x' };
    const diff = buildDiff(before, after);
    expect(Object.keys(diff)).toEqual(['name']);
    expect(diff['name'].before).toBe('A');
    expect(diff['name'].after).toBe('B');
  });

  it('includes new fields that did not exist in before', () => {
    const diff = buildDiff({}, { foo: 'bar' });
    expect(diff['foo'].before).toBeNull();
    expect(diff['foo'].after).toBe('bar');
  });
});
