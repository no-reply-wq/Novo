/**
 * SQL transpiler — converts simple field-comparison expressions to Postgres
 * WHERE clause fragments for embedding in RLS CREATE POLICY statements.
 *
 * Returns null for expressions that cannot be safely translated.
 */

import type { SqlFragment, ExprType } from './index';
import type { ExprAST, ASTNode, FieldRefNode } from './ast';

type FieldTypes = Record<string, ExprType>;

/** Extract the column name from a record.field_name FieldRef */
function recordField(node: ASTNode): string | null {
  if (node.type !== 'FieldRef') return null;
  if (node.parts[0] !== 'record') return null;
  if (node.parts.length !== 2) return null;
  return node.parts[1];
}

/** Extract user claim path from a user.xxx FieldRef */
function userClaim(node: ASTNode): string | null {
  if (node.type !== 'FieldRef') return null;
  if (node.parts[0] !== 'user') return null;
  if (node.parts.length !== 2) return null;
  return node.parts[1];
}

function claimSql(claim: string): string {
  return `current_setting('claims')::jsonb->>'${claim}'`;
}

function claimArraySql(claim: string): string {
  return `ARRAY(SELECT jsonb_array_elements_text(current_setting('claims')::jsonb->'${claim}'))`;
}

export function toSql(ast: ExprAST, _fieldTypes: FieldTypes): SqlFragment | null {
  try {
    return transpileNode(ast.root);
  } catch {
    return null;
  }
}

function transpileNode(node: ASTNode): SqlFragment | null {
  if (node.type !== 'BinaryOp' && node.type !== 'In') return null;

  if (node.type === 'In') {
    const col = recordField(node.value);
    if (!col) return null;
    const claim = userClaim(node.list);
    if (!claim) return null;
    // record.col IN user.locations → col = ANY(ARRAY(...))
    const op = node.negated ? '!= ALL' : '= ANY';
    return {
      sql: `${col} ${op}(${claimArraySql(claim)})`,
      params: [],
    };
  }

  // BinaryOp
  const { op, left, right } = node;

  if (op === 'AND' || op === 'OR') {
    const lf = transpileNode(left);
    const rf = transpileNode(right);
    if (!lf || !rf) return null;
    return {
      sql: `(${lf.sql}) ${op} (${rf.sql})`,
      params: [...lf.params, ...rf.params],
    };
  }

  const compOps: Record<string, string> = {
    '=': '=', '!=': '!=', '<': '<', '>': '>', '<=': '<=', '>=': '>=',
  };
  if (!compOps[op]) return null;
  const sqlOp = compOps[op];

  // record.field = user.claim
  const colL = recordField(left);
  const claimR = userClaim(right);
  if (colL && claimR) {
    return { sql: `${colL} ${sqlOp} ${claimSql(claimR)}`, params: [] };
  }

  // user.claim = record.field (reversed)
  const claimL = userClaim(left);
  const colR = recordField(right);
  if (claimL && colR) {
    // flip the operator
    const flipped: Record<string, string> = {
      '=': '=', '!=': '!=', '<': '>', '>': '<', '<=': '>=', '>=': '<=',
    };
    return { sql: `${colR} ${flipped[sqlOp]} ${claimSql(claimL)}`, params: [] };
  }

  // record.field = literal
  if (colL && right.type === 'Literal') {
    const v = right.value;
    if (v === null) {
      return { sql: `${colL} IS ${op === '=' ? '' : 'NOT '}NULL`, params: [] };
    }
    return { sql: `${colL} ${sqlOp} $1`, params: [v] };
  }

  return null;
}
