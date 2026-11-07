/**
 * Static type analysis pass — walks the AST and infers types.
 * Does not evaluate; just reasons about ExprType.
 */

import type { ExprType, TypeCheckResult, ParseError } from './index';
import type { ASTNode, ExprAST } from './ast';

type FieldTypes = Record<string, ExprType>;

const FUNCTION_RETURN_TYPES: Record<string, ExprType> = {
  SUM: 'number', AVG: 'number', MIN: 'number', MAX: 'number',
  ROUND: 'number', CEIL: 'number', FLOOR: 'number', ABS: 'number',
  MOD: 'number', POWER: 'number', SQRT: 'number',
  IF: 'any', IFS: 'any', SWITCH: 'any', COALESCE: 'any', NULLIF: 'any',
  CONCAT: 'text', TRIM: 'text', UPPER: 'text', LOWER: 'text',
  LEFT: 'text', RIGHT: 'text', MID: 'text', REPLACE: 'text',
  LEN: 'number', JOIN: 'text',
  CONTAINS: 'boolean', STARTS_WITH: 'boolean', ENDS_WITH: 'boolean',
  SPLIT: 'array',
  DATE_DIFF: 'number', DATE_ADD: 'date', FORMAT_DATE: 'text',
  YEAR: 'number', MONTH: 'number', DAY: 'number', WEEKDAY: 'number',
  TODAY: 'date', NOW: 'date',
  SUMIF: 'number', COUNTIF: 'number', AVGIF: 'number',
  COUNT: 'number', COUNT_DISTINCT: 'number',
  FILTER: 'array', MAP: 'array', FIND: 'any', EVERY: 'boolean', SOME: 'boolean',
  FLAT: 'array', UNIQUE: 'array', SORT_BY: 'array',
  LOOKUP: 'array', SEQUENCE: 'number',
  TEXT: 'text', NUMBER: 'number', BOOLEAN: 'boolean',
  IS_NULL: 'boolean', IS_BLANK: 'boolean', TYPE_OF: 'text',
  FORMAT_INR: 'text', AMOUNT_IN_WORDS: 'text',
};

export function typeCheck(ast: ExprAST, fieldTypes: FieldTypes): TypeCheckResult {
  const errors: ParseError[] = [];
  const warnings: Array<{ message: string; position?: number }> = [];

  function infer(node: ASTNode): ExprType {
    switch (node.type) {
      case 'Literal': {
        const v = node.value;
        if (v === null) return 'null';
        if (typeof v === 'boolean') return 'boolean';
        if (typeof v === 'number') return 'number';
        if (typeof v === 'string') return 'text';
        if (v instanceof Date) return 'date';
        return 'any';
      }
      case 'Array': return 'array';

      case 'FieldRef': {
        const [root, ...rest] = node.parts;
        // Check if it looks like a known field
        const fieldKey = rest.length > 0 ? rest[rest.length - 1] : root;
        if (fieldTypes[fieldKey]) return fieldTypes[fieldKey];
        if (fieldTypes[node.parts.join('.')]) return fieldTypes[node.parts.join('.')];
        return 'any';
      }

      case 'UnaryOp':
        if (node.op === '-') return 'number';
        if (node.op === 'NOT') return 'boolean';
        return 'any';

      case 'BinaryOp': {
        const op = node.op;
        if (['=','!=','<','>','<=','>=','AND','OR'].includes(op)) return 'boolean';
        if (op === '+') {
          const lt = infer(node.left);
          const rt = infer(node.right);
          if (lt === 'text' || rt === 'text') return 'text';
          return 'number';
        }
        return 'number';
      }

      case 'In': return 'boolean';

      case 'FunctionCall': {
        const retType = FUNCTION_RETURN_TYPES[node.name];
        if (!retType) {
          warnings.push({ message: `Unknown function '${node.name}'` });
          return 'any';
        }
        // Type-check arguments for numeric functions — boolean/date/array args are errors
        const numericArgFns = new Set([
          'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'CEIL', 'FLOOR', 'ABS',
          'MOD', 'POWER', 'SQRT', 'LEN', 'DATE_DIFF', 'YEAR', 'MONTH',
          'DAY', 'WEEKDAY', 'COUNT', 'COUNT_DISTINCT', 'SUMIF', 'COUNTIF',
          'AVGIF', 'SEQUENCE', 'NUMBER', 'FORMAT_INR', 'AMOUNT_IN_WORDS',
        ]);
        if (numericArgFns.has(node.name) && node.args.length > 0) {
          for (let i = 0; i < node.args.length; i++) {
            const argType = infer(node.args[i]);
            if (argType === 'boolean' || argType === 'date' || argType === 'array') {
              errors.push({
                message: `${node.name}: argument ${i + 1} should be number or text, got ${argType}`,
              });
            }
          }
        }
        return retType;
      }
    }
  }

  let inferredType: ExprType = 'any';
  try {
    inferredType = infer(ast.root);
  } catch (e) {
    errors.push({ message: String(e) });
  }

  return {
    ok: errors.length === 0,
    inferredType,
    errors,
    warnings,
  };
}
