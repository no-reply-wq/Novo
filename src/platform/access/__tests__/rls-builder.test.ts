/**
 * rls-builder.test.ts — unit tests (pure SQL generation, no DB)
 */

import { buildRlsPolicy, buildRlsPolicies } from '../rls-builder';
import type { AccessPolicy } from '@/platform/contracts';
import type { ExprEngine, ExprType, CompiledExpr, SqlFragment } from '@/platform/expr';

// ─── Minimal ExprEngine mock ──────────────────────────────────────────────────

function makeEngine(fragment: SqlFragment | null): ExprEngine {
  return {
    parse: (source: string): CompiledExpr => ({ source, resultType: 'boolean' }),
    typeCheck: () => ({ ok: true, inferredType: 'boolean', errors: [], warnings: [] }),
    evaluate: () => null,
    evaluateSource: () => null,
    toSql: (_expr, _fieldTypes) => fragment,
  };
}

function makePolicy(overrides: Partial<AccessPolicy> = {}): AccessPolicy {
  return {
    id: 'policy-abc-123',
    tableId: 'tenant_acme.orders',
    roleId: 'manager',
    operation: 'select',
    condition: 'record.owner_id = user.id',
    priority: 100,
    enabled: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

const fieldTypes: Record<string, ExprType> = { owner_id: 'text', status: 'text' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildRlsPolicy', () => {
  it('generates correct CREATE POLICY SQL for a translatable condition', () => {
    const engine = makeEngine({ sql: 'owner_id = current_setting(\'app.user_id\', true)', params: [] });
    const result = buildRlsPolicy(makePolicy(), fieldTypes, engine);

    expect(result.policyName).toBe('novo_policy-abc-123');
    expect(result.createSql).toContain('CREATE POLICY "novo_policy-abc-123"');
    expect(result.createSql).toContain('ON "tenant_acme"."orders"');
    expect(result.createSql).toContain('FOR SELECT');
    expect(result.createSql).toContain('TO tenant_app_role');
    expect(result.createSql).toContain('USING (');
    expect(result.dropSql).toBe('DROP POLICY IF EXISTS "novo_policy-abc-123" ON "tenant_acme"."orders";');
  });

  it('falls back to USING (false) when toSql returns null', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = makeEngine(null);
    const result = buildRlsPolicy(makePolicy(), fieldTypes, engine);

    expect(result.createSql).toContain('USING (false)');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('falling back to USING (false)'));
    warnSpy.mockRestore();
  });

  it('falls back to USING (false) for empty condition', () => {
    const engine = makeEngine({ sql: 'TRUE', params: [] });
    const result = buildRlsPolicy(makePolicy({ condition: '' }), fieldTypes, engine);
    expect(result.createSql).toContain('USING (false)');
  });

  it('handles all operation types', () => {
    const engine = makeEngine({ sql: 'TRUE', params: [] });
    const ops: AccessPolicy['operation'][] = ['select', 'insert', 'update', 'delete', 'all'];
    for (const operation of ops) {
      const result = buildRlsPolicy(makePolicy({ operation }), fieldTypes, engine);
      if (operation === 'insert') {
        expect(result.createSql).toContain('WITH CHECK (');
      } else {
        expect(result.createSql).toContain('USING (');
      }
    }
  });

  it('embeds string params safely (single-quote escaping)', () => {
    const engine = makeEngine({ sql: "status = $1", params: ["it's fine"] });
    const result = buildRlsPolicy(makePolicy(), fieldTypes, engine);
    // Single quotes should be doubled
    expect(result.createSql).toContain("'it''s fine'");
  });

  it('embeds numeric params', () => {
    const engine = makeEngine({ sql: 'priority > $1', params: [42] });
    const result = buildRlsPolicy(makePolicy(), fieldTypes, engine);
    expect(result.createSql).toContain('42');
  });

  it('embeds boolean params', () => {
    const engine = makeEngine({ sql: 'active = $1', params: [true] });
    const result = buildRlsPolicy(makePolicy(), fieldTypes, engine);
    expect(result.createSql).toContain('TRUE');
  });

  it('embeds null params', () => {
    const engine = makeEngine({ sql: 'deleted_at IS $1', params: [null] });
    const result = buildRlsPolicy(makePolicy(), fieldTypes, engine);
    expect(result.createSql).toContain('NULL');
  });

  it('throws for unsafe table names', () => {
    const engine = makeEngine({ sql: 'TRUE', params: [] });
    expect(() =>
      buildRlsPolicy(makePolicy({ tableId: 'drop table orders; --' }), fieldTypes, engine),
    ).toThrow('unsafe characters');
  });

  it('throws for unsafe policy id', () => {
    const engine = makeEngine({ sql: 'TRUE', params: [] });
    expect(() =>
      buildRlsPolicy(makePolicy({ id: '' }), fieldTypes, engine),
    ).toThrow('empty sanitized identifier');
  });

  it('buildRlsPolicies wraps multiple policies in a transaction', () => {
    const engine = makeEngine({ sql: 'TRUE', params: [] });
    const policies = [makePolicy({ id: 'p1' }), makePolicy({ id: 'p2' })];
    const { transactionSql } = buildRlsPolicies(policies, fieldTypes, engine);
    expect(transactionSql).toMatch(/^BEGIN;/);
    expect(transactionSql).toContain('DROP POLICY IF EXISTS "novo_p1"');
    expect(transactionSql).toContain('CREATE POLICY "novo_p1"');
    expect(transactionSql).toContain('DROP POLICY IF EXISTS "novo_p2"');
    expect(transactionSql).toContain('CREATE POLICY "novo_p2"');
    expect(transactionSql).toMatch(/COMMIT;$/);
  });

  it('falls back when parse throws', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const engine: ExprEngine = {
      parse: () => { throw new Error('syntax error'); },
      typeCheck: () => ({ ok: false, inferredType: 'any', errors: [], warnings: [] }),
      evaluate: () => null,
      evaluateSource: () => null,
      toSql: () => null,
    };
    const result = buildRlsPolicy(makePolicy(), fieldTypes, engine);
    expect(result.createSql).toContain('USING (false)');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('parse error'));
    warnSpy.mockRestore();
  });
});
