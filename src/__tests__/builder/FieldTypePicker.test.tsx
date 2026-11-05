/**
 * FieldTypePicker — unit tests for exported constants and logic.
 * (No jsdom/testing-library available; we test pure logic.)
 */

import { FIELD_TYPE_GROUPS } from '@/components/builder/FieldTypePicker';
import type { FieldType } from '@/platform/contracts/fields';

describe('FIELD_TYPE_GROUPS', () => {
  it('has the expected category labels', () => {
    const labels = FIELD_TYPE_GROUPS.map((g) => g.label);
    expect(labels).toContain('Text');
    expect(labels).toContain('Numbers');
    expect(labels).toContain('Dates');
    expect(labels).toContain('Choice');
    expect(labels).toContain('Links');
    expect(labels).toContain('Files');
    expect(labels).toContain('Computed');
  });

  it('contains all 7 categories', () => {
    expect(FIELD_TYPE_GROUPS).toHaveLength(7);
  });

  it('every type entry has type, label, and icon', () => {
    for (const group of FIELD_TYPE_GROUPS) {
      for (const entry of group.types) {
        expect(entry.type).toBeTruthy();
        expect(entry.label).toBeTruthy();
        expect(entry.icon).toBeTruthy();
      }
    }
  });

  it('contains formula in Computed group', () => {
    const computed = FIELD_TYPE_GROUPS.find((g) => g.label === 'Computed');
    expect(computed).toBeDefined();
    const types = computed!.types.map((t) => t.type);
    expect(types).toContain('formula');
    expect(types).toContain('rollup');
    expect(types).toContain('auto_number');
    expect(types).toContain('status_from_rules');
    expect(types).toContain('lookup_value');
  });

  it('contains all choice types', () => {
    const choice = FIELD_TYPE_GROUPS.find((g) => g.label === 'Choice');
    const types = choice!.types.map((t) => t.type);
    expect(types).toContain('dropdown');
    expect(types).toContain('multi_select');
    expect(types).toContain('radio');
    expect(types).toContain('checkbox');
    expect(types).toContain('boolean');
  });

  it('all types are unique across groups', () => {
    const allTypes: FieldType[] = FIELD_TYPE_GROUPS.flatMap((g) => g.types.map((t) => t.type));
    const uniqueTypes = new Set(allTypes);
    expect(allTypes.length).toBe(uniqueTypes.size);
  });
});
