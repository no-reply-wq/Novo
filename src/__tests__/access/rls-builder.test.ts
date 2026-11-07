/**
 * src/__tests__/access/rls-builder.test.ts
 *
 * Unit tests for rls-builder.ts — no DB required.
 */

import { buildRlsPolicy, buildRlsPolicies } from '@/platform/access/rls-builder';
import type { AccessPolicy } from '@/platform/contracts';
import type { ExprEngine, ExprType } from '@/platform/expr';

// ─── Minimal ExprEngine stub ─────────────────────────────────────────────────

function makeEngine(sql: string | null): ExprEngine {
  return {
    parse: (expr: string) => ({ expr }),
    toSql: (_compiled: unknown, _fieldTypes: Record<string, ExprType>) =>
      sql === null ? null : { sql, params: [] },
  } as unknown as ExprEngine;
}

function makePolicy(
  overrides: Partial<AccessPolicy> = {},
): AccessPolicy {
  return {
    id: 'test-policy-1',
    tableId: 'orders',
    roleId: 'manager',
    operation: 'select',
    condition: "record.owner_id = user.id",
    priority: 100,
    enabled: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildRlsPolicy', () => {
  it('generates a correct SELECT policy with a simple SQL fragment', () => {
    const engine = makeEngine(`owner_id = current_setting('app.user_id', true)`);
    const result = buildRlsPolicy(makePolicy(), {}, engine);

    expect(result.policyName).toBe('novo_test-policy-1');
    expect(result.createSql).toContain('CREATE POLICY');
    expect(result.createSql).toContain('FOR SELECT');
    expect(result.createSql).toContain('USING');
    expect(result.createSql).toContain('tenant_app_role');
    expect(result.dropSql).toContain('DROP POLICY IF EXISTS');
  });

  it('falls back to USING (false) when engine returns null', () => {
    const engine = makeEngine(null);
    const result = buildRlsPolicy(makePolicy(), {}, engine);
    expect(result.createSql).toContain('USING (false)');
  });

  it('INSERT operation uses WITH CHECK only', () => {
    const engine = makeEngine('true');
    const result = buildRlsPolicy(makePolicy({ operation: 'insert' }), {}, engine);
    expect(result.createSql).toContain('WITH CHECK');
    expect(result.createSql).not.toContain('USING');
  });

  it('UPDATE operation uses USING and WITH CHECK', () => {
    const engine = makeEngine('true');
    const result = buildRlsPolicy(makePolicy({ operation: 'update' }), {}, engine);
    expect(result.createSql).toContain('USING');
    expect(result.createSql).toContain('WITH CHECK');
  });

  it('ALL operation uses USING and WITH CHECK', () => {
    const engine = makeEngine('true');
    const result = buildRlsPolicy(makePolicy({ operation: 'all' }), {}, engine);
    expect(result.createSql).toContain('USING');
    expect(result.createSql).toContain('WITH CHECK');
  });

  it('DELETE operation uses USING only', () => {
    const engine = makeEngine('true');
    const result = buildRlsPolicy(makePolicy({ operation: 'delete' }), {}, engine);
    expect(result.createSql).toContain('USING');
    expect(result.createSql).not.toContain('WITH CHECK');
  });

  it('empty condition becomes USING (false)', () => {
    const engine = makeEngine('anything'); // should not be called
    const result = buildRlsPolicy(makePolicy({ condition: '' }), {}, engine);
    expect(result.createSql).toContain('USING (false)');
  });

  it('schema-qualified tableId is handled correctly', () => {
    const engine = makeEngine('true');
    const result = buildRlsPolicy(
      makePolicy({ tableId: 'my_schema.orders' }),
      {},
      engine,
    );
    expect(result.createSql).toContain('"my_schema"."orders"');
  });

  it('throws for unsafe policy id', () => {
    const engine = makeEngine('true');
    expect(() =>
      buildRlsPolicy(makePolicy({ id: '' }), {}, engine),
    ).toThrow();
  });

  it('throws for unsafe table name', () => {
    const engine = makeEngine('true');
    expect(() =>
      buildRlsPolicy(makePolicy({ tableId: 'drop table--' }), {}, engine),
    ).toThrow();
  });
});

describe('buildRlsPolicies', () => {
  it('wraps all DDL in a BEGIN/COMMIT block', () => {
    const engine = makeEngine('true');
    const policies = [makePolicy(), makePolicy({ id: 'test-policy-2' })];
    const { transactionSql } = buildRlsPolicies(policies, {}, engine);
    expect(transactionSql).toMatch(/^BEGIN;/);
    expect(transactionSql).toMatch(/COMMIT;$/);
  });

  it('includes drop + create for each policy', () => {
    const engine = makeEngine('true');
    const policies = [makePolicy(), makePolicy({ id: 'policy-b' })];
    const { policies: results, transactionSql } = buildRlsPolicies(policies, {}, engine);
    expect(results).toHaveLength(2);
    expect(transactionSql).toContain('DROP POLICY IF EXISTS');
    expect(transactionSql).toContain('CREATE POLICY');
  });
});
