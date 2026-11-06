/**
 * SQL expression compiler for the Novo expression engine.
 *
 * Translates simple arithmetic / comparison expressions into SQL fragments
 * that can be embedded in a SELECT clause or WHERE condition.
 *
 * Returns null for expressions that cannot be safely compiled to SQL
 * (array functions, date functions, unknown identifiers, etc.).
 *
 * Security: pure module — no I/O, no dynamic code execution.
 */

import { parse, ASTNode } from './parser';
import { ParseError } from './parser';

// ─── SQL compilation ──────────────────────────────────────────────────────────

type CompileResult = string | null;

// Functions that map 1:1 to SQL equivalents
const SQL_MATH_FUNCTIONS: Record<string, string> = {
  ROUND:  'ROUND',
  FLOOR:  'FLOOR',
  CEIL:   'CEILING',
  ABS:    'ABS',
  UPPER:  'UPPER',
  LOWER:  'LOWER',
  TRIM:   'TRIM',
  LEN:    'LENGTH',
  CONCAT: 'CONCAT',
  COALESCE: 'COALESCE',
};

function compileNode(node: ASTNode, fieldMap: Record<string, string>): CompileResult {
  switch (node.type) {
    case 'Literal': {
      const v = node.value;
      if (v === null) return 'NULL';
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      if (typeof v === 'number') {
        // Guard against NaN / Infinity
        if (!isFinite(v)) return null;
        return String(v);
      }
      // String — escape single quotes
      return `'${String(v).replace(/'/g, "''")}'`;
    }

    case 'Identifier': {
      const col = fieldMap[node.name];
      if (!col) return null; // unknown field — cannot compile
      // Wrap in double quotes for safe SQL identifier
      return `"${col.replace(/"/g, '""')}"`;
    }

    case 'MemberExpression': {
      // Only support record.field or top-level field access
      if (node.object.type === 'Identifier' && node.object.name === 'record') {
        const col = fieldMap[node.property];
        if (!col) return null;
        return `"${col.replace(/"/g, '""')}"`;
      }
      return null;
    }

    case 'UnaryExpression': {
      const operand = compileNode(node.operand, fieldMap);
      if (operand === null) return null;
      if (node.op === '-') return `(-${operand})`;
      if (node.op === '!') return `(NOT ${operand})`;
      return null;
    }

    case 'BinaryExpression': {
      const left  = compileNode(node.left,  fieldMap);
      const right = compileNode(node.right, fieldMap);
      if (left === null || right === null) return null;

      const opMap: Record<string, string> = {
        '+':  '+',
        '-':  '-',
        '*':  '*',
        '/':  '/',
        '%':  '%',
        '==': '=',
        '!=': '<>',
        '<':  '<',
        '<=': '<=',
        '>':  '>',
        '>=': '>=',
      };
      const sqlOp = opMap[node.op];
      if (!sqlOp) return null;

      // Safe division: wrap in NULLIF to avoid division-by-zero
      if (node.op === '/') {
        return `(${left} / NULLIF(${right}, 0))`;
      }

      return `(${left} ${sqlOp} ${right})`;
    }

    case 'LogicalExpression': {
      const left  = compileNode(node.left,  fieldMap);
      const right = compileNode(node.right, fieldMap);
      if (left === null || right === null) return null;
      const op = node.op === '&&' ? 'AND' : 'OR';
      return `(${left} ${op} ${right})`;
    }

    case 'ConditionalExpression': {
      const test  = compileNode(node.test,       fieldMap);
      const then_ = compileNode(node.consequent, fieldMap);
      const else_ = compileNode(node.alternate,  fieldMap);
      if (test === null || then_ === null || else_ === null) return null;
      return `CASE WHEN ${test} THEN ${then_} ELSE ${else_} END`;
    }

    case 'CallExpression': {
      const fnName = node.callee.toUpperCase();

      // IF → CASE WHEN
      if (fnName === 'IF') {
        if (node.args.length < 2) return null;
        const test  = compileNode(node.args[0], fieldMap);
        const then_ = compileNode(node.args[1], fieldMap);
        const else_ = node.args[2] ? compileNode(node.args[2], fieldMap) : 'NULL';
        if (test === null || then_ === null || else_ === null) return null;
        return `CASE WHEN ${test} THEN ${then_} ELSE ${else_} END`;
      }

      // COALESCE
      if (fnName === 'COALESCE') {
        const compiledArgs = node.args.map(a => compileNode(a, fieldMap));
        if (compiledArgs.some(a => a === null)) return null;
        return `COALESCE(${compiledArgs.join(', ')})`;
      }

      // ISBLANK → IS NULL OR = ''
      if (fnName === 'ISBLANK') {
        const arg = compileNode(node.args[0], fieldMap);
        if (arg === null) return null;
        return `(${arg} IS NULL OR ${arg} = '')`;
      }

      // ROUND with optional decimals
      if (fnName === 'ROUND') {
        const n   = compileNode(node.args[0], fieldMap);
        const dec = node.args[1] ? compileNode(node.args[1], fieldMap) : '0';
        if (n === null || dec === null) return null;
        return `ROUND(${n}, ${dec})`;
      }

      // Simple passthrough functions
      const sqlFn = SQL_MATH_FUNCTIONS[fnName];
      if (sqlFn) {
        const compiledArgs = node.args.map(a => compileNode(a, fieldMap));
        if (compiledArgs.some(a => a === null)) return null;
        return `${sqlFn}(${compiledArgs.join(', ')})`;
      }

      // Any other function (SUM, DATE functions, Indian biz) → cannot compile
      return null;
    }

    case 'ArrayExpression':
      // Array literals can't be compiled to scalar SQL
      return null;
  }
}

/**
 * Attempt to compile an expression string to a SQL expression fragment.
 *
 * @param expression  - The expression string (without {{ }})
 * @param fieldMap    - Maps field names to column names
 * @returns SQL string or null (fall back to JS evaluation)
 */
export function compileToSQL(
  expression: string,
  fieldMap: Record<string, string>,
): string | null {
  try {
    const ast = parse(expression);
    return compileNode(ast, fieldMap);
  } catch (e) {
    if (e instanceof ParseError) return null;
    return null;
  }
}
