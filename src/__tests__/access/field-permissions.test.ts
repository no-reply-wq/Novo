/**
 * src/__tests__/access/field-permissions.test.ts
 *
 * Unit tests for filterRecordFields in field-permissions-store.ts — no DB required.
 */

import { filterRecordFields } from '@/platform/access/field-permissions-store';
import type { FieldPermissionLevel } from '@/platform/access/field-permissions-store';

function makeFieldPerms(
  overrides: Record<string, Record<string, FieldPermissionLevel>> = {},
): Record<string, Record<string, FieldPermissionLevel>> {
  return overrides;
}

const FIELD_TYPES = { name: 'text', email: 'text', salary: 'number', secret: 'text' };

describe('filterRecordFields', () => {
  it('passes through all fields when no permissions are configured', () => {
    const record = { name: 'Alice', email: 'a@test.com', salary: 100 };
    const result = filterRecordFields(record, FIELD_TYPES, ['viewer'], {});
    expect(result).toEqual(record);
  });

  it('removes hidden fields for the user role', () => {
    const record = { name: 'Alice', salary: 100, secret: 'topsecret' };
    const fp = makeFieldPerms({ secret: { viewer: 'hidden' } });
    const result = filterRecordFields(record, FIELD_TYPES, ['viewer'], fp);
    expect(result).not.toHaveProperty('secret');
    expect(result).toHaveProperty('name', 'Alice');
  });

  it('keeps read_only fields in output', () => {
    const record = { name: 'Alice', salary: 100 };
    const fp = makeFieldPerms({ salary: { viewer: 'read_only' } });
    const result = filterRecordFields(record, FIELD_TYPES, ['viewer'], fp);
    expect(result).toHaveProperty('salary', 100);
  });

  it('applies strictest permission when user has multiple roles', () => {
    const record = { name: 'Alice', salary: 100 };
    const fp = makeFieldPerms({
      salary: { viewer: 'read_write', auditor: 'hidden' },
    });
    // user has both roles — 'hidden' wins
    const result = filterRecordFields(record, FIELD_TYPES, ['viewer', 'auditor'], fp);
    expect(result).not.toHaveProperty('salary');
  });

  it('defaults to read_write when field has no permissions for any user role', () => {
    const record = { name: 'Alice', salary: 100 };
    const fp = makeFieldPerms({ salary: { admin: 'hidden' } });
    // user has 'viewer' role only — no entry → default read_write
    const result = filterRecordFields(record, FIELD_TYPES, ['viewer'], fp);
    expect(result).toHaveProperty('salary', 100);
  });

  it('honours __all__ role for fields visible to everyone', () => {
    const record = { name: 'Alice', salary: 100 };
    const fp = makeFieldPerms({ salary: { __all__: 'hidden' } });
    const result = filterRecordFields(record, FIELD_TYPES, ['viewer'], fp);
    expect(result).not.toHaveProperty('salary');
  });

  it('filters out fields not in fieldTypes when fieldTypes is non-empty', () => {
    const record = { name: 'Alice', extra_col: 'injected' };
    const result = filterRecordFields(record, FIELD_TYPES, ['viewer'], {});
    expect(result).not.toHaveProperty('extra_col');
    expect(result).toHaveProperty('name');
  });

  it('passes through all fields when fieldTypes is empty (no schema info)', () => {
    const record = { name: 'Alice', extra: 'value' };
    const result = filterRecordFields(record, {}, ['viewer'], {});
    // when fieldTypes is empty, no filtering by schema
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('extra');
  });
});
