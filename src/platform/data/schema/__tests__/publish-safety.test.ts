/**
 * Safety tests for the schema publisher.
 *
 * These guard against the catastrophic bug where publishing an app diffed the
 * ENTIRE tenant schema against the app's tables and emitted drop_table for
 * every system/ERP table (users, roles, _tables, _fields, …), destroying the
 * tenant.
 *
 * Unit-level, no DB required:
 *  1. diffSchema never emits drop_table for a non-builder table (one whose
 *     name carries neither the ct_ nor the _jn_ prefix).
 *  2. applyStep hard-guard throws SchemaPublishError on any step targeting a
 *     non-builder table, before running any SQL.
 */

import type { PoolClient } from 'pg';
import type { TableDef, FieldDef } from '@/platform/contracts';
import { diffSchema, isBuilderOwnedTable, physicalTableName, MigrationStep } from '../diff';
import { applyStep } from '../publish';
import { SchemaPublishError } from '../../errors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function field(id: string, apiKey: string): FieldDef {
  return {
    id,
    tableId: 't',
    name: apiKey,
    apiKey,
    type: 'text',
    rank: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as FieldDef;
}

function table(apiKey: string, name: string, fields: FieldDef[] = []): TableDef {
  return {
    id: apiKey,
    appId: 'app1',
    name,
    apiKey,
    fields,
    relations: [],
    schemaVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as TableDef;
}

/** Fake client that records queries; fails the test if any SQL runs. */
function fakeClient(): { client: PoolClient; queries: string[] } {
  const queries: string[] = [];
  const client = {
    query: (sql: string) => {
      queries.push(typeof sql === 'string' ? sql : JSON.stringify(sql));
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  } as unknown as PoolClient;
  return { client, queries };
}

// ─── 1. diffSchema never drops non-builder tables ────────────────────────────

describe('diffSchema — system-table drop safety', () => {
  it('never emits drop_table for system tables present in "current" but absent from the app', () => {
    const current = [
      table('users', 'users'),
      table('roles', 'roles'),
      table('_tables', '_tables'),
      table('_fields', '_fields'),
      table('sales_orders', 'sales_orders'), // ERP table
    ];
    const next: TableDef[] = []; // app defines no tables at all

    const diff = diffSchema(current, next);

    const drops = diff.steps.filter(s => s.kind === 'drop_table');
    expect(drops).toHaveLength(0);
    // Every refused drop is surfaced as a warning instead
    expect(diff.warnings.some(w => w.includes('Refusing to drop'))).toBe(true);
  });

  it('still drops builder-owned ct_ tables that were removed from the app', () => {
    const current = [
      table('items', 'ct_items'), // physical name carries ct_ prefix
      table('users', 'users'),
    ];
    const next: TableDef[] = [];

    const diff = diffSchema(current, next);
    const drops = diff.steps.filter(
      (s): s is Extract<MigrationStep, { kind: 'drop_table' }> => s.kind === 'drop_table',
    );

    expect(drops).toHaveLength(1);
    expect(drops[0].tableName).toBe('ct_items');
    // Every emitted drop target must be builder-owned
    for (const d of drops) {
      expect(isBuilderOwnedTable(d.tableName)).toBe(true);
    }
  });

  it('emits all create/alter steps against ct_-prefixed physical names', () => {
    const next = [table('items', 'Items', [field('f1', 'title')])];
    const diff = diffSchema([], next);

    for (const s of diff.steps) {
      const target = s.kind === 'create_junction' || s.kind === 'drop_junction'
        ? s.junctionTable
        : s.tableName;
      expect(isBuilderOwnedTable(target)).toBe(true);
    }
    expect(diff.steps.find(s => s.kind === 'create_table')).toMatchObject({ tableName: 'ct_items' });
  });

  it('does not churn (drop+re-add) a column created by the fields route when ids are resolved by apiKey', () => {
    // current column resolved to the SAME field id as next (publish.ts does
    // this resolution via the registry when no column comment exists)
    const current = [table('items', 'ct_items', [field('f1', 'title')])];
    const next = [table('items', 'Items', [field('f1', 'title')])];
    const diff = diffSchema(current, next);
    expect(diff.steps.filter(s => s.kind === 'drop_column')).toHaveLength(0);
    expect(diff.steps.filter(s => s.kind === 'add_column')).toHaveLength(0);
  });
});

describe('physicalTableName', () => {
  it('prefixes slugs and passes through already-prefixed names', () => {
    expect(physicalTableName('items')).toBe('ct_items');
    expect(physicalTableName('ct_items')).toBe('ct_items');
    expect(physicalTableName('_jn_items_tags')).toBe('_jn_items_tags');
  });
});

// ─── 2. applyStep hard guard ─────────────────────────────────────────────────

describe('applyStep — builder-ownership hard guard', () => {
  const destructiveSteps: MigrationStep[] = [
    { kind: 'drop_table', tableId: 'x', tableName: 'users' },
    { kind: 'drop_table', tableId: 'x', tableName: 'roles' },
    { kind: 'drop_table', tableId: 'x', tableName: '_tables' },
    { kind: 'drop_column', tableId: 'x', tableName: '_fields', fieldId: 'f', columnName: 'slug' },
    { kind: 'drop_junction', junctionTable: 'sales_orders' },
  ];

  it.each(destructiveSteps.map(s => [s.kind, stepName(s), s] as const))(
    'throws SchemaPublishError for %s on non-builder table "%s" without running SQL',
    async (_kind, _name, step) => {
      const { client, queries } = fakeClient();
      await expect(applyStep(client, 'tenant_test', step, [])).rejects.toThrow(SchemaPublishError);
      expect(queries).toHaveLength(0); // guard fires BEFORE any SQL
    },
  );

  it('refuses non-destructive steps on non-builder tables too', async () => {
    const { client, queries } = fakeClient();
    const step: MigrationStep = { kind: 'create_table', tableId: 'x', tableName: 'users' };
    await expect(applyStep(client, 'tenant_test', step, [])).rejects.toThrow(SchemaPublishError);
    expect(queries).toHaveLength(0);
  });

  it('allows drop_table on builder-owned ct_ tables', async () => {
    const { client, queries } = fakeClient();
    const step: MigrationStep = { kind: 'drop_table', tableId: 'x', tableName: 'ct_items' };
    await expect(applyStep(client, 'tenant_test', step, [])).resolves.toBeUndefined();
    expect(queries.length).toBeGreaterThan(0);
    expect(queries[0]).toContain('"ct_items"');
  });

  it('allows steps on _jn_ junction tables', async () => {
    const { client } = fakeClient();
    const step: MigrationStep = { kind: 'drop_junction', junctionTable: '_jn_items_tags' };
    await expect(applyStep(client, 'tenant_test', step, [])).resolves.toBeUndefined();
  });
});

function stepName(s: MigrationStep): string {
  return s.kind === 'create_junction' || s.kind === 'drop_junction' ? s.junctionTable : s.tableName;
}
