/**
 * Field type system for the Novo Data Builder.
 *
 * This module re-exports the canonical field types from the platform contracts
 * and adds richer typed aliases used by the data builder layer.
 */

export type {
  TextFieldType,
  NumberFieldType,
  DateFieldType,
  ChoiceFieldType,
  LinkFieldType,
  CaptureFieldType,
  ComputedFieldType,
  FieldType,
  TextFieldOptions,
  NumberFieldOptions,
  ChoiceOption,
  ChoiceFieldOptions,
  LookupFieldOptions,
  FileFieldOptions,
  FormulaFieldOptions,
  RollupFieldOptions,
  LookupValueFieldOptions,
  AutoNumberOptions,
  StatusFromRulesOptions,
  FieldOptions,
  FieldDef,
} from '@/platform/contracts';

import type { FieldDef, RollupFieldOptions, AutoNumberOptions } from '@/platform/contracts';

// ─── Narrow typed field definitions ──────────────────────────────────────────

/** FieldDef narrowed to formula type */
export interface FormulaField extends FieldDef {
  type: 'formula';
  options: import('@/platform/contracts').FormulaFieldOptions;
}

/** FieldDef narrowed to rollup type */
export interface RollupField extends FieldDef {
  type: 'rollup';
  options: RollupFieldOptions;
}

/** FieldDef narrowed to auto_number type */
export interface AutoNumberField extends FieldDef {
  type: 'auto_number';
  options: AutoNumberOptions;
}

/** FieldDef narrowed to lookup type */
export interface LookupField extends FieldDef {
  type: 'lookup';
  options: import('@/platform/contracts').LookupFieldOptions;
}

/** FieldDef narrowed to status_from_rules type */
export interface StatusFromRulesField extends FieldDef {
  type: 'status_from_rules';
  options: import('@/platform/contracts').StatusFromRulesOptions;
}

// ─── TableSchema (used throughout data-builder layer) ─────────────────────────

/**
 * Minimal schema view needed by formula/validation/rollup engines.
 * Corresponds to TableDef but avoids the full contract import where unneeded.
 */
export type { TableDef as TableSchema } from '@/platform/contracts';

// ─── Validation error ─────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;        // apiKey of the field that failed
  message: string;
  code:
    | 'required'
    | 'min'
    | 'max'
    | 'pattern'
    | 'cross_field'
    | 'cross_record'
    | 'sum_children'
    | 'unique'
    | 'conditional_required'
    | 'custom';
}
