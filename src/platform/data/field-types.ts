/**
 * Advanced computed field type definitions for the data builder.
 *
 * This file is the single source of truth for:
 * - Config interface validation
 * - SQL column type mapping
 * - Serializer/deserializer helpers
 *
 * It re-exports and narrows the contracts types so the rest of the data
 * layer can import from one place.
 */

export type {
  FormulaFieldOptions,
  RollupFieldOptions,
  LookupValueFieldOptions,
  AutoNumberOptions,
  StatusFromRulesOptions,
  FieldDef,
  FieldType,
  ComputedFieldType,
} from '@/platform/contracts';

import type {
  FormulaFieldOptions,
  RollupFieldOptions,
  LookupValueFieldOptions,
  AutoNumberOptions,
  StatusFromRulesOptions,
  FieldDef,
} from '@/platform/contracts';

// ─── Computed field type tag ──────────────────────────────────────────────────

export const COMPUTED_FIELD_TYPES = new Set([
  'formula',
  'rollup',
  'lookup_value',
  'auto_number',
  'status_from_rules',
] as const);

export type ComputedFieldTypeName =
  | 'formula'
  | 'rollup'
  | 'lookup_value'
  | 'auto_number'
  | 'status_from_rules';

// ─── Narrow typed FieldDef aliases ───────────────────────────────────────────

export interface FormulaFieldDef extends FieldDef {
  type: 'formula';
  options: FormulaFieldOptions;
}

export interface RollupFieldDef extends FieldDef {
  type: 'rollup';
  options: RollupFieldOptions;
}

export interface LookupValueFieldDef extends FieldDef {
  type: 'lookup_value';
  options: LookupValueFieldOptions;
}

export interface AutoNumberFieldDef extends FieldDef {
  type: 'auto_number';
  options: AutoNumberOptions;
}

export interface StatusFromRulesFieldDef extends FieldDef {
  type: 'status_from_rules';
  options: StatusFromRulesOptions;
}

// ─── SQL column type mapping ──────────────────────────────────────────────────

/**
 * Returns the Postgres column type for a computed field, or null if the field
 * is fully virtual (no physical column).
 */
export function computedFieldSqlType(type: ComputedFieldTypeName): string | null {
  switch (type) {
    case 'formula':          return null;   // virtual — computed at read time
    case 'rollup':           return null;   // virtual — computed via subquery
    case 'lookup_value':     return null;   // virtual — traversed at read time
    case 'auto_number':      return 'TEXT'; // physical: TEXT UNIQUE NOT NULL
    case 'status_from_rules': return null;  // virtual — rule-evaluated
  }
}

// ─── Config validation ────────────────────────────────────────────────────────

export interface FieldTypeValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateFormulaOptions(
  opts: unknown,
): FieldTypeValidationResult {
  const errors: string[] = [];
  if (!opts || typeof opts !== 'object') {
    return { ok: false, errors: ['options is required'] };
  }
  const o = opts as Record<string, unknown>;
  if (typeof o['expression'] !== 'string' || !o['expression'].trim()) {
    errors.push('expression must be a non-empty string');
  }
  const validReturnTypes = ['number', 'text', 'boolean', 'date'];
  if (!validReturnTypes.includes(o['returnType'] as string)) {
    errors.push(`returnType must be one of: ${validReturnTypes.join(', ')}`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateRollupOptions(
  opts: unknown,
): FieldTypeValidationResult {
  const errors: string[] = [];
  if (!opts || typeof opts !== 'object') {
    return { ok: false, errors: ['options is required'] };
  }
  const o = opts as Record<string, unknown>;
  if (typeof o['sourceRelationId'] !== 'string' || !o['sourceRelationId']) {
    errors.push('sourceRelationId is required');
  }
  if (typeof o['sourceFieldId'] !== 'string' || !o['sourceFieldId']) {
    errors.push('sourceFieldId is required');
  }
  const validAggs = ['sum', 'count', 'avg', 'min', 'max', 'count_distinct'];
  if (!validAggs.includes(o['aggregation'] as string)) {
    errors.push(`aggregation must be one of: ${validAggs.join(', ')}`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateLookupValueOptions(
  opts: unknown,
): FieldTypeValidationResult {
  const errors: string[] = [];
  if (!opts || typeof opts !== 'object') {
    return { ok: false, errors: ['options is required'] };
  }
  const o = opts as Record<string, unknown>;
  if (typeof o['relationId'] !== 'string' || !o['relationId']) {
    errors.push('relationId is required');
  }
  if (typeof o['sourceFieldId'] !== 'string' || !o['sourceFieldId']) {
    errors.push('sourceFieldId is required');
  }
  return { ok: errors.length === 0, errors };
}

export function validateAutoNumberOptions(
  opts: unknown,
): FieldTypeValidationResult {
  const errors: string[] = [];
  if (!opts || typeof opts !== 'object') {
    return { ok: false, errors: ['options is required'] };
  }
  const o = opts as Record<string, unknown>;
  if (o['padding'] !== undefined) {
    const p = Number(o['padding']);
    if (!Number.isInteger(p) || p < 1 || p > 20) {
      errors.push('padding must be an integer between 1 and 20');
    }
  }
  const validResetRules = ['never', 'yearly', 'monthly'];
  if (o['resetRule'] !== undefined && !validResetRules.includes(o['resetRule'] as string)) {
    errors.push(`resetRule must be one of: ${validResetRules.join(', ')}`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateStatusFromRulesOptions(
  opts: unknown,
): FieldTypeValidationResult {
  const errors: string[] = [];
  if (!opts || typeof opts !== 'object') {
    return { ok: false, errors: ['options is required'] };
  }
  const o = opts as Record<string, unknown>;
  if (!Array.isArray(o['rules'])) {
    errors.push('rules must be an array');
  } else {
    (o['rules'] as unknown[]).forEach((rule, i) => {
      if (!rule || typeof rule !== 'object') {
        errors.push(`rules[${i}] must be an object`);
        return;
      }
      const r = rule as Record<string, unknown>;
      if (typeof r['label'] !== 'string' || !r['label']) {
        errors.push(`rules[${i}].label is required`);
      }
      if (typeof r['condition'] !== 'string' || !r['condition']) {
        errors.push(`rules[${i}].condition is required`);
      }
      if (typeof r['rank'] !== 'number') {
        errors.push(`rules[${i}].rank must be a number`);
      }
    });
  }
  if (typeof o['defaultStatus'] !== 'string' || !o['defaultStatus']) {
    errors.push('defaultStatus is required');
  }
  return { ok: errors.length === 0, errors };
}

// ─── Validation dispatcher ────────────────────────────────────────────────────

export function validateComputedFieldOptions(
  type: ComputedFieldTypeName,
  opts: unknown,
): FieldTypeValidationResult {
  switch (type) {
    case 'formula':           return validateFormulaOptions(opts);
    case 'rollup':            return validateRollupOptions(opts);
    case 'lookup_value':      return validateLookupValueOptions(opts);
    case 'auto_number':       return validateAutoNumberOptions(opts);
    case 'status_from_rules': return validateStatusFromRulesOptions(opts);
  }
}

// ─── Serializer / deserializer ────────────────────────────────────────────────

/**
 * Serialize field options to a JSON-safe object (for storage).
 * Currently a pass-through; can be extended for normalization.
 */
export function serializeFieldOptions(
  type: ComputedFieldTypeName,
  opts: FormulaFieldOptions | RollupFieldOptions | LookupValueFieldOptions | AutoNumberOptions | StatusFromRulesOptions,
): Record<string, unknown> {
  // Ensure ranks in status_from_rules are numbers
  if (type === 'status_from_rules') {
    const o = opts as StatusFromRulesOptions;
    return {
      ...o,
      rules: o.rules.map((r, i) => ({
        ...r,
        rank: typeof r.rank === 'number' ? r.rank : i,
      })),
    };
  }
  return opts as Record<string, unknown>;
}

/**
 * Deserialize field options from raw JSONB (from database).
 * Returns typed options or throws on invalid data.
 */
export function deserializeFieldOptions(
  type: ComputedFieldTypeName,
  raw: unknown,
): FormulaFieldOptions | RollupFieldOptions | LookupValueFieldOptions | AutoNumberOptions | StatusFromRulesOptions {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid options for field type '${type}'`);
  }
  const validation = validateComputedFieldOptions(type, raw);
  if (!validation.ok) {
    throw new Error(`Invalid options for '${type}': ${validation.errors.join('; ')}`);
  }
  // Type-narrowed casts are safe after validation
  switch (type) {
    case 'formula':           return raw as FormulaFieldOptions;
    case 'rollup':            return raw as RollupFieldOptions;
    case 'lookup_value':      return raw as LookupValueFieldOptions;
    case 'auto_number':       return raw as AutoNumberOptions;
    case 'status_from_rules': return raw as StatusFromRulesOptions;
  }
}
