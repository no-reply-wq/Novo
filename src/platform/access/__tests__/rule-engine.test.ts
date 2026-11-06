/**
 * src/platform/access/__tests__/rule-engine.test.ts
 *
 * Security and correctness tests for the Wave 8 access rule engine.
 * These tests verify isolation, injection safety, and permission enforcement.
 */

import { evaluateAccessRule, buildAccessFilter } from '../rule-engine';
import { getFieldPermissions, applyFieldPermissions, getProtectedFieldViolations } from '../field-permissions';
import type { TableAccessRule, FieldPermission, UserPermissionOverride } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<TableAccessRule> = {}): TableAccessRule {
  return {
    id: 'rule-1',
    tableId: 'table-orders',
    roleId: 'member',
    operation: 'select',
    condition: 'record.owner_id == user.id',
    priority: 0,
    ...overrides,
  };
}

const userA = { id: 'user-a', role: 'member', locations: ['loc-1', 'loc-2'] };
const userB = { id: 'user-b', role: 'member', locations: ['loc-3'] };
const adminUser = { id: 'user-admin', role: 'admin', locations: [] };

// ─── 1. owner_id isolation ────────────────────────────────────────────────────

describe('record.owner_id == user.id — row isolation', () => {
  const rule = makeRule({ condition: 'record.owner_id == user.id' });

  it('user A can see their own records', () => {
    expect(evaluateAccessRule(rule, { owner_id: 'user-a' }, userA)).toBe(true);
  });

  it('user A cannot see user B records', () => {
    expect(evaluateAccessRule(rule, { owner_id: 'user-b' }, userA)).toBe(false);
  });

  it('user B cannot see user A records', () => {
    expect(evaluateAccessRule(rule, { owner_id: 'user-a' }, userB)).toBe(false);
  });

  it('user B can see their own records', () => {
    expect(evaluateAccessRule(rule, { owner_id: 'user-b' }, userB)).toBe(true);
  });

  it('record with null owner_id is not visible to any user', () => {
    expect(evaluateAccessRule(rule, { owner_id: null }, userA)).toBe(false);
    expect(evaluateAccessRule(rule, { owner_id: null }, userB)).toBe(false);
  });
});

// ─── 2. Location-based access ─────────────────────────────────────────────────

describe('record.location_id in user.locations — multi-location isolation', () => {
  const rule = makeRule({ condition: 'record.location_id in user.locations' });

  it('user with loc-1 and loc-2 can see records from those locations', () => {
    expect(evaluateAccessRule(rule, { location_id: 'loc-1' }, userA)).toBe(true);
    expect(evaluateAccessRule(rule, { location_id: 'loc-2' }, userA)).toBe(true);
  });

  it('user with loc-1 and loc-2 cannot see records from loc-3', () => {
    expect(evaluateAccessRule(rule, { location_id: 'loc-3' }, userA)).toBe(false);
  });

  it('user with only loc-3 can see records from loc-3', () => {
    expect(evaluateAccessRule(rule, { location_id: 'loc-3' }, userB)).toBe(true);
  });

  it('user with loc-3 cannot see records from loc-1 or loc-2', () => {
    expect(evaluateAccessRule(rule, { location_id: 'loc-1' }, userB)).toBe(false);
    expect(evaluateAccessRule(rule, { location_id: 'loc-2' }, userB)).toBe(false);
  });

  it('a user with no locations cannot see any location-scoped records', () => {
    const noLocUser = { id: 'user-x', role: 'member', locations: [] };
    expect(evaluateAccessRule(rule, { location_id: 'loc-1' }, noLocUser)).toBe(false);
  });
});

// ─── 3. Status list filter ────────────────────────────────────────────────────

describe('record.status in ["Draft","Pending"] — static array filter', () => {
  const rule = makeRule({ condition: 'record.status in ["Draft","Pending"]' });

  it('allows access when record.status is Draft', () => {
    expect(evaluateAccessRule(rule, { status: 'Draft' }, userA)).toBe(true);
  });

  it('allows access when record.status is Pending', () => {
    expect(evaluateAccessRule(rule, { status: 'Pending' }, userA)).toBe(true);
  });

  it('denies access when record.status is Approved', () => {
    expect(evaluateAccessRule(rule, { status: 'Approved' }, userA)).toBe(false);
  });

  it('denies access when record.status is null', () => {
    expect(evaluateAccessRule(rule, { status: null }, userA)).toBe(false);
  });
});

// ─── 4. Admin role — no row filter = access all ───────────────────────────────

describe('admin role with empty condition — access all records', () => {
  const adminRule = makeRule({ roleId: 'admin', condition: '' });

  it('admin can see all records regardless of owner', () => {
    expect(evaluateAccessRule(adminRule, { owner_id: 'user-a' }, adminUser)).toBe(true);
    expect(evaluateAccessRule(adminRule, { owner_id: 'user-b' }, adminUser)).toBe(true);
    expect(evaluateAccessRule(adminRule, { owner_id: null }, adminUser)).toBe(true);
  });

  it('buildAccessFilter returns TRUE for admin with empty condition', () => {
    const sql = buildAccessFilter([adminRule], adminUser);
    expect(sql).toBe('(TRUE)');
  });
});

// ─── 5. buildAccessFilter — role filtering ────────────────────────────────────

describe('buildAccessFilter — only applies rules for the requesting user role', () => {
  it('returns FALSE when no rules match the user role', () => {
    const rule = makeRule({ roleId: 'admin' });
    const sql = buildAccessFilter([rule], userA);  // userA role = 'member', not 'admin'
    expect(sql).toBe('FALSE');
  });

  it('applies __all__ rules to every role', () => {
    const rule = makeRule({ roleId: '__all__', condition: 'record.owner_id == user.id' });
    const sql = buildAccessFilter([rule], userB);
    expect(sql).toContain("current_setting('app.user_id'");
  });

  it('OR-es multiple matching rules', () => {
    const r1 = makeRule({ id: 'r1', roleId: 'member', condition: 'record.owner_id == user.id', priority: 0 });
    const r2 = makeRule({ id: 'r2', roleId: 'member', condition: 'record.shared == "true"', priority: 1 });
    const sql = buildAccessFilter([r1, r2], userA);
    expect(sql).toContain(' OR ');
  });
});

// ─── 6. Field permissions — hidden fields absent in response ──────────────────

describe('Field hidden from role — field absent in filtered record', () => {
  const tableId = 'table-orders';
  const fieldPerms: FieldPermission[] = [
    { id: 'fp-1', tableId, fieldId: 'salary', roleId: 'member', permission: 'hidden' },
    { id: 'fp-2', tableId, fieldId: 'notes', roleId: 'member', permission: 'read_only' },
    { id: 'fp-3', tableId, fieldId: 'name', roleId: 'member', permission: 'editable' },
  ];

  it('hidden field is absent from filtered record', () => {
    const perms = getFieldPermissions(tableId, fieldPerms, 'member');
    const record = { id: '1', name: 'Alice', salary: 100000, notes: 'VIP' };
    const filtered = applyFieldPermissions(record, perms);
    expect(filtered).not.toHaveProperty('salary');
    expect(filtered).toHaveProperty('name', 'Alice');
    expect(filtered).toHaveProperty('notes', 'VIP');
  });

  it('admin role does not get member restrictions', () => {
    const perms = getFieldPermissions(tableId, fieldPerms, 'admin');
    const record = { id: '1', name: 'Alice', salary: 100000, notes: 'VIP' };
    const filtered = applyFieldPermissions(record, perms);
    expect(filtered).toHaveProperty('salary');
    expect(filtered).toHaveProperty('notes');
  });

  it('__all__ role restriction applies to everyone', () => {
    const globalPerms: FieldPermission[] = [
      { id: 'fp-g', tableId, fieldId: 'secret', roleId: '__all__', permission: 'hidden' },
    ];
    const permsForMember = getFieldPermissions(tableId, globalPerms, 'member');
    const permsForAdmin = getFieldPermissions(tableId, globalPerms, 'admin');
    const record = { id: '1', secret: 'shh' };
    expect(applyFieldPermissions(record, permsForMember)).not.toHaveProperty('secret');
    expect(applyFieldPermissions(record, permsForAdmin)).not.toHaveProperty('secret');
  });
});

// ─── 7. Field read-only — write rejected ──────────────────────────────────────

describe('Field read-only — update on that field rejected with violations list', () => {
  const tableId = 'table-orders';
  const fieldPerms: FieldPermission[] = [
    { id: 'fp-ro', tableId, fieldId: 'created_at', roleId: 'member', permission: 'read_only' },
    { id: 'fp-h', tableId, fieldId: 'salary', roleId: 'member', permission: 'hidden' },
    { id: 'fp-e', tableId, fieldId: 'name', roleId: 'member', permission: 'editable' },
  ];

  it('write to read_only field is listed as a violation', () => {
    const perms = getFieldPermissions(tableId, fieldPerms, 'member');
    const violations = getProtectedFieldViolations({ created_at: '2024-01-01' }, perms);
    expect(violations).toContain('created_at');
  });

  it('write to hidden field is also a violation', () => {
    const perms = getFieldPermissions(tableId, fieldPerms, 'member');
    const violations = getProtectedFieldViolations({ salary: 999 }, perms);
    expect(violations).toContain('salary');
  });

  it('write to editable field produces no violation', () => {
    const perms = getFieldPermissions(tableId, fieldPerms, 'member');
    const violations = getProtectedFieldViolations({ name: 'Bob' }, perms);
    expect(violations).toHaveLength(0);
  });

  it('write payload with both editable and read-only fields returns only protected ones', () => {
    const perms = getFieldPermissions(tableId, fieldPerms, 'member');
    const violations = getProtectedFieldViolations(
      { name: 'Bob', created_at: '2024-01-01', salary: 100 },
      perms,
    );
    expect(violations).toContain('created_at');
    expect(violations).toContain('salary');
    expect(violations).not.toContain('name');
  });
});

// ─── 8. User override — overrides role default ────────────────────────────────

describe('User override — explicit override wins over role default', () => {
  const tableId = 'table-orders';
  const fieldPerms: FieldPermission[] = [
    { id: 'fp-1', tableId, fieldId: 'salary', roleId: 'member', permission: 'hidden' },
  ];

  it('user override can expose a field that is hidden for the role', () => {
    const override: UserPermissionOverride = {
      id: 'ov-1',
      userId: 'user-a',
      tableId,
      overrides: {
        fieldOverrides: { salary: 'read_only' },
      },
    };
    const perms = getFieldPermissions(tableId, fieldPerms, 'member', override);
    expect(perms.salary).toBe('read_only');  // override wins
    const record = { id: '1', salary: 100000 };
    const filtered = applyFieldPermissions(record, perms);
    expect(filtered).toHaveProperty('salary');  // now visible
  });

  it('user override can hide a field that is editable for the role', () => {
    const editPerms: FieldPermission[] = [
      { id: 'fp-2', tableId, fieldId: 'notes', roleId: 'member', permission: 'editable' },
    ];
    const override: UserPermissionOverride = {
      id: 'ov-2',
      userId: 'user-b',
      tableId,
      overrides: {
        fieldOverrides: { notes: 'hidden' },
      },
    };
    const perms = getFieldPermissions(tableId, editPerms, 'member', override);
    expect(perms.notes).toBe('hidden');
    const record = { id: '1', notes: 'private' };
    const filtered = applyFieldPermissions(record, perms);
    expect(filtered).not.toHaveProperty('notes');
  });

  it('user override for a different table does not affect this table', () => {
    const override: UserPermissionOverride = {
      id: 'ov-3',
      userId: 'user-a',
      tableId: 'other-table',
      overrides: { fieldOverrides: { salary: 'editable' } },
    };
    const perms = getFieldPermissions(tableId, fieldPerms, 'member', override);
    expect(perms.salary).toBe('hidden');  // override for other-table ignored
  });
});

// ─── 9. SQL injection attempt — rejected/sanitized ───────────────────────────

describe('SQL injection attempt in condition expression — rejected', () => {
  const rule = makeRule({ condition: "1=1; DROP TABLE orders; --" });
  const record = { id: '1', owner_id: 'user-a' };

  it('evaluateAccessRule throws for injection pattern', () => {
    expect(() => evaluateAccessRule(rule, record, userA)).toThrow(
      /forbidden characters or keywords/i,
    );
  });

  it('buildAccessFilter produces FALSE (deny) for injection pattern, not SQL', () => {
    // The injection pattern is caught; the filter should produce FALSE not raw SQL
    const sql = buildAccessFilter([rule], userA);
    expect(sql).toBe('FALSE');
    // The malicious string must NOT appear raw in the output
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('--');
  });

  it('single-quote inside double-quoted string literal is escaped in SQL output', () => {
    // A condition with a single-quote inside a double-quoted string is valid syntax
    // The engine must escape it properly when producing SQL
    const rule = makeRule({ condition: `record.name == "O'Brien"` });
    const sql = buildAccessFilter([rule], userA);
    // The malicious ';DROP...' pattern uses semicolons — but a bare apostrophe in
    // a double-quoted string is legitimate. The SQL output must escape it.
    // The filter should produce a valid SQL expression (not FALSE) and escape the quote.
    expect(sql).toContain("O''Brien");  // SQL literal escaping: ' → ''
  });

  it('UNION-based injection in condition is rejected', () => {
    const unionRule = makeRule({ condition: "record.id == 1 UNION SELECT password FROM users" });
    expect(() => evaluateAccessRule(unionRule, record, userA)).toThrow(
      /forbidden characters or keywords/i,
    );
    const sql = buildAccessFilter([unionRule], userA);
    expect(sql).toBe('FALSE');
  });

  it('injecting user.id referencing a non-allowlisted user prop throws', () => {
    const badRule = makeRule({ condition: 'record.owner_id == user.password' });
    expect(() => evaluateAccessRule(badRule, record, userA)).toThrow(
      /user property.*not allowed/i,
    );
  });
});

// ─── 10. Cross-tenant access — blocked by SQL design ─────────────────────────

describe('Cross-tenant access — session variables prevent cross-tenant reads', () => {
  it('buildAccessFilter uses current_setting session variable for user.id — not a literal', () => {
    const rule = makeRule({ condition: 'record.owner_id == user.id' });
    const sql = buildAccessFilter([rule], userA);
    // The filter uses current_setting, not userA's literal id
    expect(sql).toContain("current_setting('app.user_id'");
    expect(sql).not.toContain('user-a');   // literal id must NOT appear
  });

  it('buildAccessFilter uses current_setting for location check', () => {
    const rule = makeRule({ condition: 'record.location_id in user.locations' });
    const sql = buildAccessFilter([rule], userA);
    expect(sql).toContain("current_setting('app.locations'");
    // Literal location values must NOT be embedded
    expect(sql).not.toContain('loc-1');
    expect(sql).not.toContain('loc-2');
  });

  it('a user role not matching any rule gets FALSE — deny all', () => {
    const adminRule = makeRule({ roleId: 'admin', condition: 'record.owner_id == user.id' });
    // tenant_b_user has role 'tenant_b_role' which doesn't match 'admin'
    const tenantBUser = { id: 'tenant-b-user', role: 'tenant_b_role', locations: [] };
    const sql = buildAccessFilter([adminRule], tenantBUser);
    expect(sql).toBe('FALSE');
  });

  it('buildAccessFilter produces safe SQL for location check with no SQL fragments from user data', () => {
    const rule = makeRule({ condition: 'record.location_id in user.locations' });
    const userWithMaliciousLocation = {
      id: "'; DROP TABLE orders; --",
      role: 'member',
      locations: ["'; DROP TABLE orders; --"],
    };
    // Even with a malicious user object, SQL output must use session variables, not literals
    const sql = buildAccessFilter([rule], userWithMaliciousLocation);
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toContain("current_setting('app.locations'");
  });
});

// ─── 11. Priority ordering ────────────────────────────────────────────────────

describe('buildAccessFilter respects priority ordering', () => {
  it('lower priority number appears first in output', () => {
    const r1 = makeRule({ id: 'r1', condition: 'record.owner_id == user.id', priority: 10 });
    const r2 = makeRule({ id: 'r2', condition: 'record.shared == "true"', priority: 1 });
    const sql = buildAccessFilter([r1, r2], userA);
    const idxR1 = sql.indexOf('"owner_id"');
    const idxR2 = sql.indexOf('"shared"');
    // r2 (priority 1) should appear before r1 (priority 10)
    expect(idxR2).toBeLessThan(idxR1);
  });
});

// ─── 12. Dotted path in record field ─────────────────────────────────────────

describe('record nested path evaluation', () => {
  it('evaluates record.client.sales_group correctly', () => {
    const rule = makeRule({
      condition: 'record.client.sales_group == user.group',
      roleId: 'member',
    });
    const userWithGroup = { id: 'user-a', role: 'member', locations: [], group: 'north' };
    expect(evaluateAccessRule(rule, { client: { sales_group: 'north' } }, userWithGroup)).toBe(true);
    expect(evaluateAccessRule(rule, { client: { sales_group: 'south' } }, userWithGroup)).toBe(false);
  });
});

// ─── 13. Strictest field permission wins across roles ─────────────────────────

describe('getFieldPermissions — strictest permission wins when multiple match', () => {
  const tableId = 'table-orders';

  it('hidden takes precedence over read_only for the same field', () => {
    const perms: FieldPermission[] = [
      { id: 'p1', tableId, fieldId: 'salary', roleId: 'member', permission: 'read_only' },
      { id: 'p2', tableId, fieldId: 'salary', roleId: '__all__', permission: 'hidden' },
    ];
    const result = getFieldPermissions(tableId, perms, 'member');
    expect(result.salary).toBe('hidden');
  });

  it('read_only takes precedence over editable for the same field', () => {
    const perms: FieldPermission[] = [
      { id: 'p1', tableId, fieldId: 'name', roleId: 'member', permission: 'editable' },
      { id: 'p2', tableId, fieldId: 'name', roleId: '__all__', permission: 'read_only' },
    ];
    const result = getFieldPermissions(tableId, perms, 'member');
    expect(result.name).toBe('read_only');
  });

  it('fields with no permission entry default to editable', () => {
    const result = getFieldPermissions(tableId, [], 'member');
    expect(result.any_field).toBeUndefined();
    // Undefined means no restriction — applyFieldPermissions keeps the field
    const record = { any_field: 'value' };
    expect(applyFieldPermissions(record, result)).toHaveProperty('any_field');
  });
});
