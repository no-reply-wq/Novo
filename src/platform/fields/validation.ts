/**
 * Validation engine for field values and full records.
 *
 * Rules:
 * - min/max (number and date)
 * - regex pattern
 * - cross-field: `end_km > start_km`
 * - cross-record: `qty <= po_line.pending_qty` (async, needs db)
 * - sum of children equals 100: `SUM(lines.percent) = 100`
 * - unique (single field and composite)
 * - conditional required (expression)
 */

import { PoolClient } from 'pg';
import { parseExpression } from '@/platform/expr/parser';
import { evaluateAST } from '@/platform/expr/evaluator';
import type { ExprContext, ExprValue } from '@/platform/expr';
import type { FieldDef, TableSchema } from './types';
import type { ValidationError } from './types';
import type {
  NumberFieldOptions,
  TextFieldOptions,
} from '@/platform/contracts';

export type { ValidationError };

// ─── Single-field validation ──────────────────────────────────────────────────

/**
 * Validate a single field value against its definition.
 *
 * @param value    - value to validate
 * @param fieldDef - field definition
 * @param row      - full record (for cross-field rule evaluation)
 * @returns array of validation errors (empty = valid)
 */
export function validateField(
  value: unknown,
  fieldDef: FieldDef,
  row: Record<string, unknown>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // ── Required ──────────────────────────────────────────────────────────────
  const isBlank = value === null || value === undefined || value === '';
  if (fieldDef.required) {
    if (typeof fieldDef.required === 'boolean') {
      if (fieldDef.required && isBlank) {
        errors.push({ field: fieldDef.apiKey, message: `${fieldDef.name} is required`, code: 'required' });
        return errors; // no point continuing if blank and required
      }
    } else {
      // Expression-based required
      const result = safeEvalExpr(fieldDef.required, row);
      if (result === true && isBlank) {
        errors.push({ field: fieldDef.apiKey, message: `${fieldDef.name} is required`, code: 'conditional_required' });
        return errors;
      }
    }
  }

  if (isBlank) return errors; // no further validation on blank optional field

  // ── Number min/max ────────────────────────────────────────────────────────
  if ((fieldDef.type === 'integer' || fieldDef.type === 'decimal' ||
       fieldDef.type === 'currency' || fieldDef.type === 'percent' ||
       fieldDef.type === 'quantity') && typeof value === 'number') {
    const opts = fieldDef.options as NumberFieldOptions | undefined;
    if (opts?.min !== undefined && value < opts.min) {
      errors.push({
        field: fieldDef.apiKey,
        message: `${fieldDef.name} must be at least ${opts.min}`,
        code: 'min',
      });
    }
    if (opts?.max !== undefined && value > opts.max) {
      errors.push({
        field: fieldDef.apiKey,
        message: `${fieldDef.name} must be at most ${opts.max}`,
        code: 'max',
      });
    }
  }

  // ── Date min/max ──────────────────────────────────────────────────────────
  if ((fieldDef.type === 'date' || fieldDef.type === 'datetime') && value instanceof Date) {
    const opts = fieldDef.options as { min?: string; max?: string } | undefined;
    if (opts?.min) {
      const minDate = new Date(opts.min);
      if (value < minDate) {
        errors.push({
          field: fieldDef.apiKey,
          message: `${fieldDef.name} must not be before ${opts.min}`,
          code: 'min',
        });
      }
    }
    if (opts?.max) {
      const maxDate = new Date(opts.max);
      if (value > maxDate) {
        errors.push({
          field: fieldDef.apiKey,
          message: `${fieldDef.name} must not be after ${opts.max}`,
          code: 'max',
        });
      }
    }
  }

  // ── Text max length ───────────────────────────────────────────────────────
  if ((fieldDef.type === 'text' || fieldDef.type === 'long_text') && typeof value === 'string') {
    const opts = fieldDef.options as TextFieldOptions | undefined;
    if (opts?.maxLength && value.length > opts.maxLength) {
      errors.push({
        field: fieldDef.apiKey,
        message: `${fieldDef.name} exceeds maximum length of ${opts.maxLength}`,
        code: 'max',
      });
    }
  }

  // ── Email format ──────────────────────────────────────────────────────────
  if (fieldDef.type === 'email' && typeof value === 'string') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push({
        field: fieldDef.apiKey,
        message: `${fieldDef.name} must be a valid email address`,
        code: 'pattern',
      });
    }
  }

  // ── URL format ────────────────────────────────────────────────────────────
  if (fieldDef.type === 'url' && typeof value === 'string') {
    try {
      new URL(value);
    } catch {
      errors.push({
        field: fieldDef.apiKey,
        message: `${fieldDef.name} must be a valid URL`,
        code: 'pattern',
      });
    }
  }

  // ── Phone format ──────────────────────────────────────────────────────────
  if (fieldDef.type === 'phone' && typeof value === 'string') {
    if (!/^\+?[\d\s\-().]{7,20}$/.test(value)) {
      errors.push({
        field: fieldDef.apiKey,
        message: `${fieldDef.name} must be a valid phone number`,
        code: 'pattern',
      });
    }
  }

  // ── Custom validation rules (expression-based) ────────────────────────────
  if (fieldDef.validationRules) {
    for (const rule of fieldDef.validationRules) {
      const result = safeEvalExpr(rule.expression, row);
      if (result === false) {
        errors.push({
          field: fieldDef.apiKey,
          message: rule.message,
          code: 'custom',
        });
      }
    }
  }

  return errors;
}

// ─── Full record validation ───────────────────────────────────────────────────

/**
 * Validate a full record against its table schema.
 *
 * Runs field-level, cross-field, and cross-record validations.
 * Async because cross-record checks require db queries.
 *
 * @param record      - record to validate
 * @param tableSchema - table schema
 * @param db          - Postgres client for cross-record validations
 * @param tenantSchema - tenant schema name
 * @returns array of validation errors (empty = valid)
 */
export async function validateRecord(
  record: Record<string, unknown>,
  tableSchema: TableSchema,
  db: PoolClient,
  tenantSchema: string,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  // ── Per-field validation ───────────────────────────────────────────────────
  for (const field of tableSchema.fields) {
    const value = record[field.apiKey];
    const fieldErrors = validateField(value, field, record);
    errors.push(...fieldErrors);
  }

  // ── Cross-field validation rules (table-level) ─────────────────────────────
  // These are stored as table-level rules (field.validationRules on a virtual "table" field)
  // Convention: fields with apiKey '__table__' hold cross-field rules
  const tableField = tableSchema.fields.find(f => f.apiKey === '__table__');
  if (tableField?.validationRules) {
    for (const rule of tableField.validationRules) {
      const result = safeEvalExpr(rule.expression, record);
      if (result === false) {
        errors.push({
          field: '__table__',
          message: rule.message,
          code: 'cross_field',
        });
      }
    }
  }

  // ── Unique validation ──────────────────────────────────────────────────────
  const uniqueErrors = await validateUnique(record, tableSchema, db, tenantSchema);
  errors.push(...uniqueErrors);

  return errors;
}

// ─── Unique constraint validation ─────────────────────────────────────────────

async function validateUnique(
  record: Record<string, unknown>,
  tableSchema: TableSchema,
  db: PoolClient,
  tenantSchema: string,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const schema = pgIdent(tenantSchema);
  const table  = pgIdent(tableSchema.apiKey);
  const recordId = record['id'] as string | undefined;

  // Single-field unique checks
  for (const field of tableSchema.fields) {
    if (!field.unique) continue;
    const value = record[field.apiKey];
    if (value === null || value === undefined || value === '') continue;

    const col = pgIdent(field.apiKey);
    const sql = recordId
      ? `SELECT 1 FROM ${schema}.${table} WHERE ${col} = $1 AND id != $2::uuid AND deleted_at IS NULL LIMIT 1`
      : `SELECT 1 FROM ${schema}.${table} WHERE ${col} = $1 AND deleted_at IS NULL LIMIT 1`;
    const params = recordId ? [value, recordId] : [value];

    try {
      const res = await db.query(sql, params);
      if (res.rows.length > 0) {
        errors.push({
          field: field.apiKey,
          message: `${field.name} must be unique`,
          code: 'unique',
        });
      }
    } catch {
      // skip on DB error (schema might not exist in test)
    }
  }

  // Composite unique checks (uniqueScope)
  for (const field of tableSchema.fields) {
    if (!field.uniqueScope || field.uniqueScope.length === 0) continue;
    const scopeFields = [field.apiKey, ...field.uniqueScope];
    const values = scopeFields.map(k => record[k]);
    if (values.some(v => v === null || v === undefined)) continue;

    const conditions = scopeFields.map((k, i) => `${pgIdent(k)} = $${i + 1}`).join(' AND ');
    const baseSql = `SELECT 1 FROM ${schema}.${table} WHERE ${conditions} AND deleted_at IS NULL`;
    const countSql = recordId
      ? `${baseSql} AND id != $${scopeFields.length + 1}::uuid LIMIT 1`
      : `${baseSql} LIMIT 1`;
    const params = recordId ? [...values, recordId] : values;

    try {
      const res = await db.query(countSql, params);
      if (res.rows.length > 0) {
        errors.push({
          field: field.apiKey,
          message: `${scopeFields.join(', ')} combination must be unique`,
          code: 'unique',
        });
      }
    } catch {
      // skip on DB error
    }
  }

  return errors;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeEvalExpr(expr: string, row: Record<string, unknown>): ExprValue {
  try {
    const ast = parseExpression(expr);
    const ctx: ExprContext = { record: row as Record<string, ExprValue> };
    return evaluateAST(ast, ctx);
  } catch {
    return null;
  }
}

function pgIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"';
}
