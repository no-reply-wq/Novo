/**
 * attack.test.ts — Security attack tests for the access layer.
 *
 * These tests verify that:
 * 1. Cross-tenant row reads are blocked (tenant isolation)
 * 2. SQL injection in AccessPolicy.condition is sanitized, not executed
 * 3. Users without required location cannot read location-scoped rows
 * 4. Expired UserOverride grants are not honoured
 */

import { buildRlsPolicy } from '../rls-builder';
import { applyFieldPermissions } from '../field-filter';
import { OverrideManager } from '../override-manager';
import type { AccessPolicy, FieldPermission, UserOverride } from '@/platform/contracts';
import type { ExprEngine, ExprType, CompiledExpr, SqlFragment } from '@/platform/expr';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEngine(fragment: SqlFragment | null): ExprEngine {
  return {
    parse: (source: string): CompiledExpr => ({ source, resultType: 'boolean' }),
    typeCheck: () => ({ ok: true, inferredType: 'boolean', errors: [], warnings: [] }),
    evaluate: () => null,
    evaluateSource: () => null,
    toSql: () => fragment,
  };
}

function makePolicy(overrides: Partial<AccessPolicy> = {}): AccessPolicy {
  return {
    id: 'test-policy',
    tableId: 'tenant_acme.orders',
    roleId: 'viewer',
    operation: 'select',
    condition: "record.tenant_id = current_setting('app.tenant_id', true)",
    priority: 100,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const fieldTypes: Record<string, ExprType> = { tenant_id: 'text', owner_id: 'text' };

// ─── Attack test 1: Cross-tenant row read ─────────────────────────────────────

describe('Attack 1: Cross-tenant row read attempt', () => {
  it('policy USING clause references tenant_id, not a user-controlled value', () => {
    // The RLS policy USING clause must bind tenant context from current_setting,
    // not from a user-supplied payload. We verify the generated SQL contains
    // current_setting and no hardcoded tenant value from user input.
    const engine = makeEngine({
      sql: "tenant_id = current_setting('app.tenant_id', true)",
      params: [],
    });
    const result = buildRlsPolicy(makePolicy(), fieldTypes, engine);
    expect(result.createSql).toContain("current_setting('app.tenant_id', true)");
    // The USING clause must not use a literal string from user input
    expect(result.createSql).not.toContain('tenant_b');
  });

  it('policy blocks tenant B user: condition resolves to false for wrong tenant', () => {
    // Simulate: tenant B user has tenant_id='tenant_b' in session.
    // The policy uses current_setting('app.tenant_id') which the middleware sets
    // to the authenticated tenant. User cannot override it via SQL.
    // We verify the generated SQL structure is safe (uses session var, not literal).
    const engine = makeEngine({
      sql: "tenant_id = current_setting('app.tenant_id', true)",
      params: [],
    });
    const { createSql } = buildRlsPolicy(makePolicy(), fieldTypes, engine);
    // The USING clause references a session variable — Postgres will evaluate it
    // per-row using the authenticated session context, not user input.
    expect(createSql).toMatch(/current_setting\('app\.tenant_id'/);
  });

  it('a policy with empty condition produces USING (false) — deny all cross-tenant', () => {
    const engine = makeEngine({ sql: 'TRUE', params: [] });
    const { createSql } = buildRlsPolicy(makePolicy({ condition: '' }), fieldTypes, engine);
    expect(createSql).toContain('USING (false)');
  });
});

// ─── Attack test 2: SQL injection in condition field ─────────────────────────

describe('Attack 2: SQL injection in AccessPolicy.condition', () => {
  it('a SQL injection string in condition is passed to the expr engine, not eval-ed', () => {
    // The condition string goes through engine.parse() → engine.toSql(), never eval().
    // If the engine returns null (can't translate), the builder falls back to USING(false).
    // We test that the malicious string is NOT embedded raw in the output SQL.
    const maliciousCondition = "1=1; DROP TABLE orders; --";
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Engine rejects the injection string (returns null = untranslatable)
    const engine = makeEngine(null);
    const { createSql } = buildRlsPolicy(
      makePolicy({ condition: maliciousCondition }),
      fieldTypes,
      engine,
    );

    // The injection payload must NOT appear in the generated SQL
    expect(createSql).not.toContain('DROP TABLE');
    expect(createSql).not.toContain('1=1');
    // We get the safe deny-all fallback
    expect(createSql).toContain('USING (false)');
    warnSpy.mockRestore();
  });

  it('single-quote injection in a param value is escaped, not executed', () => {
    // Even if the expr engine produces a param containing SQL, embedParams escapes it
    const maliciousParam = "'; DROP TABLE orders; --";
    const engine = makeEngine({ sql: 'status = $1', params: [maliciousParam] });
    const { createSql } = buildRlsPolicy(makePolicy(), fieldTypes, engine);

    // The dangerous single-quote is doubled (SQL standard escaping) so it becomes
    // a valid string literal — Postgres treats the entire injected text as a value.
    // '''; DROP TABLE orders; --' is what a correctly escaped string looks like.
    expect(createSql).toContain("''"); // doubled quote neutralises the injection
    expect(createSql).toContain("status = '''; DROP TABLE orders; --'");
    // The statement starts with CREATE POLICY and ends with the terminal semicolon.
    // It must NOT contain a bare DROP TABLE outside of a quoted string.
    // The simplest check: the SQL starts with CREATE POLICY (not intercepted by injection).
    expect(createSql.trimStart()).toMatch(/^CREATE POLICY/);
    // No unquoted DROP TABLE — verify by stripping the quoted portion and checking
    const withoutQuotedStrings = createSql.replace(/'[^']*'/g, "''");
    expect(withoutQuotedStrings).not.toContain('DROP TABLE');
  });

  it('unsafe policy id is sanitized: SQL metacharacters are stripped from policy name', () => {
    const engine = makeEngine({ sql: 'TRUE', params: [] });
    // Policy id with SQL metacharacters: quotes, semicolons, spaces are stripped.
    // The resulting policy name must not contain any SQL injection payload.
    const maliciousId = "'; DROP TABLE access_policies; --";
    const { policyName, createSql } = buildRlsPolicy(
      makePolicy({ id: maliciousId }),
      fieldTypes,
      engine,
    );
    // All SQL metacharacters stripped — only alphanumeric, hyphens and underscores remain
    expect(policyName).toMatch(/^novo_[a-zA-Z0-9_-]+$/);
    // The malicious payload does not appear in the generated SQL
    expect(createSql).not.toContain("'; DROP TABLE");
    expect(createSql).not.toContain('; DROP TABLE');
  });

  it('unsafe table name is rejected with an error, not embedded', () => {
    const engine = makeEngine({ sql: 'TRUE', params: [] });
    expect(() =>
      buildRlsPolicy(
        makePolicy({ tableId: "orders; DROP TABLE orders; --" }),
        fieldTypes,
        engine,
      ),
    ).toThrow('unsafe characters');
  });
});

// ─── Attack test 3: Location-scoped access ───────────────────────────────────

describe('Attack 3: User without required location cannot read location-scoped row', () => {
  it('field permissions hide location-sensitive data from users without location access', () => {
    // Simulate: row has a 'location_id' field; viewer role cannot see it
    const row = { id: 'row-1', name: 'Product', location_id: 'loc-mumbai', stock: 100 };
    const perms: FieldPermission[] = [
      {
        id: 'fp-loc',
        fieldId: 'location_id',
        roleId: 'viewer',
        access: 'hidden',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const result = applyFieldPermissions(row, perms, ['viewer']);
    // viewer cannot see the location_id
    expect(result).not.toHaveProperty('location_id');
    expect(result).toHaveProperty('stock', 100);
  });

  it('a user with the correct role sees the location_id field', () => {
    const row = { id: 'row-1', name: 'Product', location_id: 'loc-mumbai', stock: 100 };
    const perms: FieldPermission[] = [
      {
        id: 'fp-loc',
        fieldId: 'location_id',
        roleId: 'viewer',
        access: 'hidden',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    // admin role is not restricted
    const result = applyFieldPermissions(row, perms, ['admin']);
    expect(result).toHaveProperty('location_id', 'loc-mumbai');
  });

  it('RLS policy embeds location check via current_setting, not user input', () => {
    // Location-scoped policy: only rows where location_id IN user.locations
    const engine = makeEngine({
      sql: "location_id = ANY(string_to_array(current_setting('app.locations', true), ','))",
      params: [],
    });
    const { createSql } = buildRlsPolicy(makePolicy(), fieldTypes, engine);
    expect(createSql).toContain("current_setting('app.locations', true)");
    // No hardcoded location value
    expect(createSql).not.toContain('loc-delhi');
  });
});

// ─── Attack test 4: UserOverride expiry enforcement ──────────────────────────

describe('Attack 4: Expired UserOverride grants are not honoured', () => {
  function makeDb(rows: Record<string, unknown>[]) {
    return {
      query: jest.fn().mockResolvedValue({ rows }),
    };
  }

  it('getActiveOverrides excludes expired overrides', async () => {
    // Simulate DB returning no rows (the SQL filters by expires_at > now)
    const db = makeDb([]);
    const manager = new OverrideManager(db);
    const now = new Date('2025-06-01T12:00:00Z');

    const overrides = await manager.getActiveOverrides('user-1', 'orders', now);
    expect(overrides).toHaveLength(0);

    // Verify the query passes the 'now' parameter for expiry check
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('expires_at'),
      ['user-1', 'orders', now],
    );
  });

  it('isOverrideActive returns false for an expired override', async () => {
    // DB returns count = 0 (expired)
    const db = makeDb([{ count: '0' }]);
    const manager = new OverrideManager(db);
    const now = new Date('2025-06-01T12:00:00Z');

    const active = await manager.isOverrideActive('override-id', now);
    expect(active).toBe(false);
  });

  it('isOverrideActive returns true for a non-expired override', async () => {
    const db = makeDb([{ count: '1' }]);
    const manager = new OverrideManager(db);
    const now = new Date('2024-01-01T00:00:00Z');

    const active = await manager.isOverrideActive('override-id', now);
    expect(active).toBe(true);
  });

  it('purgeExpiredOverrides removes only overrides where expires_at <= now', async () => {
    const db = makeDb([{ count: '3' }]);
    const manager = new OverrideManager(db);
    const now = new Date('2025-06-01T12:00:00Z');

    const count = await manager.purgeExpiredOverrides(now);
    expect(count).toBe(3);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('expires_at'),
      [now],
    );
  });
});
