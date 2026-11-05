/**
 * field-filter.test.ts — unit tests for field-level permission enforcement
 */

import {
  applyFieldPermissions,
  applyFieldPermissionsToRows,
  getHiddenFields,
  getReadOnlyFields,
} from '../field-filter';
import type { FieldPermission } from '@/platform/contracts';

function makePermission(overrides: Partial<FieldPermission>): FieldPermission {
  return {
    id: 'fp-1',
    fieldId: 'salary',
    roleId: 'viewer',
    access: 'hidden',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

const baseRow = { id: 'row-1', name: 'Alice', salary: 90000, email: 'alice@example.com' };

describe('applyFieldPermissions', () => {
  it('removes fields hidden for the user role', () => {
    const perms = [makePermission({ fieldId: 'salary', roleId: 'viewer', access: 'hidden' })];
    const result = applyFieldPermissions(baseRow, perms, ['viewer']);
    expect(result).not.toHaveProperty('salary');
    expect(result).toHaveProperty('name', 'Alice');
  });

  it('does not remove fields if user does not have the matching role', () => {
    const perms = [makePermission({ fieldId: 'salary', roleId: 'viewer', access: 'hidden' })];
    const result = applyFieldPermissions(baseRow, perms, ['admin']);
    expect(result).toHaveProperty('salary', 90000);
  });

  it('removes field when roleId is __all__', () => {
    const perms = [makePermission({ fieldId: 'salary', roleId: '__all__', access: 'hidden' })];
    const result = applyFieldPermissions(baseRow, perms, ['admin']);
    expect(result).not.toHaveProperty('salary');
  });

  it('does not remove read-only fields (they are readable)', () => {
    const perms = [makePermission({ fieldId: 'salary', roleId: 'viewer', access: 'read' })];
    const result = applyFieldPermissions(baseRow, perms, ['viewer']);
    expect(result).toHaveProperty('salary', 90000);
  });

  it('removes multiple hidden fields', () => {
    const perms = [
      makePermission({ id: 'fp-1', fieldId: 'salary', roleId: 'viewer', access: 'hidden' }),
      makePermission({ id: 'fp-2', fieldId: 'email', roleId: 'viewer', access: 'hidden' }),
    ];
    const result = applyFieldPermissions(baseRow, perms, ['viewer']);
    expect(result).not.toHaveProperty('salary');
    expect(result).not.toHaveProperty('email');
    expect(result).toHaveProperty('name');
  });

  it('does not mutate the original row', () => {
    const perms = [makePermission({ fieldId: 'salary', roleId: 'viewer', access: 'hidden' })];
    const original = { ...baseRow };
    applyFieldPermissions(baseRow, perms, ['viewer']);
    expect(baseRow).toEqual(original);
  });

  it('user with multiple roles — hidden wins if any role says hidden', () => {
    const perms = [
      makePermission({ id: 'fp-1', fieldId: 'salary', roleId: 'viewer', access: 'hidden' }),
      makePermission({ id: 'fp-2', fieldId: 'salary', roleId: 'editor', access: 'write' }),
    ];
    const result = applyFieldPermissions(baseRow, perms, ['viewer', 'editor']);
    expect(result).not.toHaveProperty('salary');
  });
});

describe('applyFieldPermissionsToRows', () => {
  it('applies permissions to all rows', () => {
    const rows = [baseRow, { ...baseRow, id: 'row-2', name: 'Bob' }];
    const perms = [makePermission({ fieldId: 'salary', roleId: 'viewer', access: 'hidden' })];
    const results = applyFieldPermissionsToRows(rows, perms, ['viewer']);
    expect(results).toHaveLength(2);
    for (const row of results) {
      expect(row).not.toHaveProperty('salary');
    }
  });
});

describe('getHiddenFields', () => {
  it('returns hidden field ids for the given roles', () => {
    const perms = [
      makePermission({ id: 'fp-1', fieldId: 'salary', roleId: 'viewer', access: 'hidden' }),
      makePermission({ id: 'fp-2', fieldId: 'email', roleId: 'admin', access: 'hidden' }),
    ];
    const hidden = getHiddenFields(perms, ['viewer']);
    expect(hidden.has('salary')).toBe(true);
    expect(hidden.has('email')).toBe(false);
  });
});

describe('getReadOnlyFields', () => {
  it('returns read-only field ids for the given roles', () => {
    const perms = [
      makePermission({ id: 'fp-1', fieldId: 'salary', roleId: 'viewer', access: 'read' }),
      makePermission({ id: 'fp-2', fieldId: 'email', roleId: 'viewer', access: 'write' }),
    ];
    const readOnly = getReadOnlyFields(perms, ['viewer']);
    expect(readOnly.has('salary')).toBe(true);
    expect(readOnly.has('email')).toBe(false);
  });
});
