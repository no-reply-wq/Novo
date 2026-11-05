/**
 * Field type definitions for the Novo Data Builder.
 *
 * Every field type that a tenant admin can configure is listed here.
 * This file is the single source of truth used by:
 *   - Agent A (data model / migrations)
 *   - Agent B (expression engine)
 *   - Agent C (access / RLS)
 *   - Agent D (design system / form renderers)
 *   - Agent E (integrations / PDF renderer)
 *
 * RULE: Sub-agents may not change this file. Changes go through the Lead.
 */

// ─── Scalar field types ───────────────────────────────────────────────────────

export type TextFieldType =
  | 'text'       // single-line, max 2048 chars
  | 'long_text'  // multi-line plain text
  | 'rich_text'  // HTML rich text (stored as sanitised HTML)
  | 'email'
  | 'phone'
  | 'url'
  | 'password';  // masked display, bcrypt stored (not queryable in expr)

export type NumberFieldType =
  | 'integer'
  | 'decimal'    // arbitrary precision; scale stored in options
  | 'currency'   // ₹ display, lakh/crore formatting
  | 'percent'
  | 'quantity';  // number + unit suffix (e.g. "12 kg")

export type DateFieldType =
  | 'date'
  | 'time'
  | 'datetime'
  | 'date_range' // { from: Date; to: Date }
  | 'duration';  // stored as seconds

export type ChoiceFieldType =
  | 'dropdown'
  | 'multi_select'
  | 'radio'
  | 'checkbox'
  | 'boolean'   // yes/no toggle
  | 'rating'    // 1–N stars
  | 'color';    // hex string

export type LinkFieldType =
  | 'lookup'       // FK to any table (single or multi)
  | 'user'         // FK to platform users
  | 'location';    // FK to org-unit / location table

export type CaptureFieldType =
  | 'file'         // one or many file attachments (stored in R2)
  | 'image'        // one or many images
  | 'signature'    // base64 PNG from signature pad
  | 'barcode'      // scanned barcode / QR code string
  | 'gps'          // { lat: number; lng: number; accuracy: number }
  | 'json';        // arbitrary JSON blob

// ─── Computed field types ─────────────────────────────────────────────────────

export type ComputedFieldType =
  | 'formula'            // per-row expression → scalar
  | 'rollup'             // aggregate over related rows
  | 'lookup_value'       // read a field through a relation
  | 'auto_number'        // sequential identifier with format string
  | 'status_from_rules'; // derived status computed from ranked child rules

export type FieldType =
  | TextFieldType
  | NumberFieldType
  | DateFieldType
  | ChoiceFieldType
  | LinkFieldType
  | CaptureFieldType
  | ComputedFieldType;

// ─── Field options (per type) ────────────────────────────────────────────────

export interface TextFieldOptions {
  maxLength?: number;       // default 2048
  multiline?: boolean;
  placeholder?: string;
}

export interface NumberFieldOptions {
  min?: number;
  max?: number;
  precision?: number;       // decimal places (default 2)
  unit?: string;            // for 'quantity' type (e.g. "kg", "pcs")
  currencyCode?: string;    // default 'INR'
}

export interface ChoiceOption {
  value: string;            // stored value (stable key)
  label: string;            // displayed label
  color?: string;           // hex color for pills
  rank?: number;            // display order
}

export interface ChoiceFieldOptions {
  choices: ChoiceOption[];
  allowOther?: boolean;     // let the user type a custom value
}

export interface LookupFieldOptions {
  targetTableId: string;
  multi?: boolean;          // allow multiple selections
  displayField?: string;    // field id to show as the label
  filterExpr?: string;      // expression to restrict selectable rows
  cascadeDelete?: 'restrict' | 'cascade' | 'set_null';
}

export interface FileFieldOptions {
  maxSizeMb?: number;       // default 10
  maxFiles?: number;        // default 1; set >1 for multi
  allowedMimeTypes?: string[]; // empty = all allowed types (excluding blocked)
}

export interface FormulaFieldOptions {
  expression: string;       // expression string (parsed by expr engine)
  returnType: 'number' | 'text' | 'boolean' | 'date';
}

export interface RollupFieldOptions {
  sourceRelationId: string; // which relation to aggregate over
  sourceFieldId: string;    // field on the related table to aggregate
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'count_distinct';
  filterExpr?: string;      // SUM-IF: expression over related row
}

export interface LookupValueFieldOptions {
  relationId: string;       // the lookup/FK field on this table
  sourceFieldId: string;    // the field to read from the related row
}

export interface AutoNumberOptions {
  prefix?: string;          // e.g. "PO-"
  includeYear?: boolean;    // append current year (e.g. "PO-2026-")
  includeLocation?: boolean;// append location code
  padding?: number;         // zero-pad sequence to N digits (default 4)
  resetRule?: 'never' | 'yearly' | 'monthly'; // when to reset the counter
  sequenceId?: string;      // shared sequence id (multiple tables can share)
}

export interface StatusFromRulesOptions {
  rules: Array<{
    label: string;          // status value when this rule matches
    color?: string;
    condition: string;      // expression (can reference child rows)
    rank: number;           // lower rank wins
  }>;
  defaultStatus: string;
}

// Union of all options types
export type FieldOptions =
  | TextFieldOptions
  | NumberFieldOptions
  | ChoiceFieldOptions
  | LookupFieldOptions
  | FileFieldOptions
  | FormulaFieldOptions
  | RollupFieldOptions
  | LookupValueFieldOptions
  | AutoNumberOptions
  | StatusFromRulesOptions
  | Record<string, unknown>; // for future / unknown types

// ─── FieldDef ────────────────────────────────────────────────────────────────

/**
 * Complete definition of one field within a table.
 *
 * Stored in the platform DB as JSONB. Agent A turns this into DDL.
 */
export interface FieldDef {
  id: string;               // stable UUID, never changes after creation
  tableId: string;
  name: string;             // human-readable label
  apiKey: string;           // snake_case column name in the tenant schema
  type: FieldType;
  options?: FieldOptions;

  // Presentation
  hint?: string;
  placeholder?: string;
  icon?: string;

  // Constraints
  required?: boolean | string;      // true, false, or an expression
  unique?: boolean;
  uniqueScope?: string[];           // combined uniqueness with these field ids
  defaultValue?: unknown;           // literal or expression string starting with '='

  // Visibility / mutability (expressions or booleans)
  visible?: boolean | string;
  readOnly?: boolean | string;

  // Validation expressions (array → ALL must pass)
  validationRules?: Array<{
    expression: string;
    message: string;
  }>;

  // Lock rule: when true the field (and its record) becomes read-only
  lockWhen?: string;              // expression
  lockExceptionRoles?: string[];  // role ids that may bypass the lock

  // Ordering
  rank: number;

  // Audit
  createdAt: Date;
  updatedAt: Date;
}
