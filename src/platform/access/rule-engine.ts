/**
 * src/platform/access/rule-engine.ts
 *
 * Evaluates TableAccessRule conditions against records and users.
 * Builds SQL WHERE fragments for Postgres RLS policies.
 *
 * Expression language (safe subset):
 *   record.<field>          → field value from the current row
 *   user.id                 → current user id
 *   user.role               → current user role
 *   user.locations          → array of location ids
 *   user.group              → optional group
 *   <value> == <value>      → equality
 *   <value> != <value>      → inequality
 *   <value> in <array>      → array membership
 *   <array literal>         → ["a","b","c"]
 *   "string literal"        → quoted string
 *   true / false / null     → literals
 */

import type { TableAccessRule, RuleUser } from './types';

// ─── Allowed identifiers ──────────────────────────────────────────────────────

/** Safe set of user properties that can appear in expressions */
const ALLOWED_USER_PROPS = new Set(['id', 'role', 'locations', 'group']);

/**
 * Reject expressions containing SQL injection patterns.
 * We allow double-quoted strings (part of our expression syntax) and single-quoted strings
 * in value positions. What we reject: semicolons, backticks, raw SQL DDL/DML keywords
 * that appear OUTSIDE of quoted string contexts, and SQL comment markers.
 *
 * The pattern checks the full expression before parsing. The parser then validates
 * that any string values are properly enclosed in quotes.
 */
const SQL_INJECTION_PATTERN = /[;`\\]|--|\/\*|\*\/|\b(DROP|ALTER|EXEC|EXECUTE|UNION|GRANT|REVOKE)\b/i;

/** Validate that an expression is safe to evaluate (no injection) */
function assertSafeExpression(expr: string): void {
  if (SQL_INJECTION_PATTERN.test(expr)) {
    throw new Error(
      `Access rule condition contains forbidden characters or keywords: ${JSON.stringify(expr)}`,
    );
  }
}

// ─── Expression AST ───────────────────────────────────────────────────────────

type ExprNode =
  | { type: 'eq'; left: ValueNode; right: ValueNode }
  | { type: 'neq'; left: ValueNode; right: ValueNode }
  | { type: 'in'; value: ValueNode; array: ArrayNode | ValueNode }
  | { type: 'literal'; value: boolean | null }
  | { type: 'always_true' };

type ValueNode =
  | { kind: 'record_field'; field: string }
  | { kind: 'user_prop'; prop: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' };

type ArrayNode =
  | { kind: 'literal_array'; values: ValueNode[] }
  | { kind: 'user_prop'; prop: string };   // e.g. user.locations

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseExpression(expr: string): ExprNode {
  const trimmed = expr.trim();

  // Empty or whitespace → allow all (admin-style)
  if (!trimmed) return { type: 'always_true' };

  assertSafeExpression(trimmed);

  // Parse "X in Y" (array membership)
  const inMatch = trimmed.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch) {
    const left = parseValue(inMatch[1].trim());
    const right = parseArrayOrValue(inMatch[2].trim());
    return { type: 'in', value: left, array: right };
  }

  // Parse "X == Y"
  const eqMatch = trimmed.match(/^(.+?)\s*==\s*(.+)$/);
  if (eqMatch) {
    return {
      type: 'eq',
      left: parseValue(eqMatch[1].trim()),
      right: parseValue(eqMatch[2].trim()),
    };
  }

  // Parse "X != Y"
  const neqMatch = trimmed.match(/^(.+?)\s*!=\s*(.+)$/);
  if (neqMatch) {
    return {
      type: 'neq',
      left: parseValue(neqMatch[1].trim()),
      right: parseValue(neqMatch[2].trim()),
    };
  }

  // "true" / "false" / "null" literals
  if (trimmed === 'true') return { type: 'literal', value: true };
  if (trimmed === 'false') return { type: 'literal', value: false };
  if (trimmed === 'null') return { type: 'literal', value: null };

  throw new Error(`Cannot parse access rule condition: ${JSON.stringify(expr)}`);
}

function parseValue(token: string): ValueNode {
  // record.<field>
  if (/^record\.[a-zA-Z_][a-zA-Z0-9_.]*$/.test(token)) {
    return { kind: 'record_field', field: token.slice('record.'.length) };
  }

  // user.<prop>
  const userMatch = token.match(/^user\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (userMatch) {
    if (!ALLOWED_USER_PROPS.has(userMatch[1])) {
      throw new Error(`user property '${userMatch[1]}' is not allowed in access rules`);
    }
    return { kind: 'user_prop', prop: userMatch[1] };
  }

  // "string literal"
  const strMatch = token.match(/^"([^"]*)"$/) ?? token.match(/^'([^']*)'$/);
  if (strMatch) {
    return { kind: 'string', value: strMatch[1] };
  }

  // number literal
  const num = Number(token);
  if (!isNaN(num) && token.trim() !== '') {
    return { kind: 'number', value: num };
  }

  // boolean
  if (token === 'true') return { kind: 'boolean', value: true };
  if (token === 'false') return { kind: 'boolean', value: false };
  if (token === 'null') return { kind: 'null' };

  throw new Error(`Cannot parse value token: ${JSON.stringify(token)}`);
}

function parseArrayOrValue(token: string): ArrayNode | ValueNode {
  // JSON array literal: ["a","b"]
  if (token.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(token);
      if (!Array.isArray(parsed)) throw new Error('Not an array');
      return {
        kind: 'literal_array',
        values: (parsed as unknown[]).map((v) => {
          if (typeof v === 'string') return { kind: 'string' as const, value: v };
          if (typeof v === 'number') return { kind: 'number' as const, value: v };
          if (typeof v === 'boolean') return { kind: 'boolean' as const, value: v };
          if (v === null) return { kind: 'null' as const };
          throw new Error(`Unsupported array element type: ${typeof v}`);
        }),
      };
    } catch {
      throw new Error(`Cannot parse array literal: ${JSON.stringify(token)}`);
    }
  }

  // user.locations (an array property)
  if (token === 'user.locations') {
    return { kind: 'user_prop', prop: 'locations' };
  }

  // Fall through to scalar value
  return parseValue(token);
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

function resolveValue(
  node: ValueNode,
  record: Record<string, unknown>,
  user: RuleUser,
): unknown {
  switch (node.kind) {
    case 'record_field': {
      // Support dotted paths: record.client.sales_group
      const parts = node.field.split('.');
      let val: unknown = record;
      for (const part of parts) {
        if (val == null || typeof val !== 'object') return undefined;
        val = (val as Record<string, unknown>)[part];
      }
      return val;
    }
    case 'user_prop':
      return (user as unknown as Record<string, unknown>)[node.prop];
    case 'string':
      return node.value;
    case 'number':
      return node.value;
    case 'boolean':
      return node.value;
    case 'null':
      return null;
  }
}

function resolveArray(
  node: ArrayNode | ValueNode,
  record: Record<string, unknown>,
  user: RuleUser,
): unknown[] {
  if ('kind' in node && node.kind === 'literal_array') {
    return node.values.map((v) => resolveValue(v, record, user));
  }
  if ('kind' in node && node.kind === 'user_prop') {
    const v = (user as unknown as Record<string, unknown>)[node.prop];
    return Array.isArray(v) ? v : [];
  }
  // Scalar value that happens to be an array
  const val = resolveValue(node as ValueNode, record, user);
  return Array.isArray(val) ? val : [];
}

function evalNode(
  node: ExprNode,
  record: Record<string, unknown>,
  user: RuleUser,
): boolean {
  switch (node.type) {
    case 'always_true':
      return true;
    case 'literal':
      return node.value === true;
    case 'eq': {
      const l = resolveValue(node.left, record, user);
      const r = resolveValue(node.right, record, user);
      return l === r;
    }
    case 'neq': {
      const l = resolveValue(node.left, record, user);
      const r = resolveValue(node.right, record, user);
      return l !== r;
    }
    case 'in': {
      const val = resolveValue(node.value, record, user);
      const arr = resolveArray(node.array, record, user);
      return arr.includes(val);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a single access rule against a record and user.
 * Returns true if the rule grants access.
 */
export function evaluateAccessRule(
  rule: TableAccessRule,
  record: Record<string, unknown>,
  user: RuleUser,
): boolean {
  const node = parseExpression(rule.condition);
  return evalNode(node, record, user);
}

// ─── SQL builder ─────────────────────────────────────────────────────────────

/**
 * Convert a parsed value node to a SQL fragment using Postgres session variables.
 *
 * user.id        → current_setting('app.user_id', true)
 * user.role      → current_setting('app.user_role', true)
 * user.locations → (SELECT jsonb_array_elements_text(current_setting('app.locations',true)::jsonb))
 * user.group     → current_setting('app.user_group', true)
 * record.<field> → "<field>"  (column reference)
 * "string"       → 'string'
 * number         → number literal
 * null           → NULL
 */
function valueToSql(node: ValueNode): string {
  switch (node.kind) {
    case 'record_field': {
      // Only allow simple alphanumeric field names as column references
      const field = node.field;
      if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field)) {
        throw new Error(`Unsafe field name in condition: ${JSON.stringify(field)}`);
      }
      // Map dotted path to plain column (only first segment for SQL)
      const col = field.split('.')[0];
      return `"${col}"`;
    }
    case 'user_prop':
      switch (node.prop) {
        case 'id':     return `current_setting('app.user_id', true)`;
        case 'role':   return `current_setting('app.user_role', true)`;
        case 'group':  return `current_setting('app.user_group', true)`;
        case 'locations':
          return `(SELECT jsonb_array_elements_text(current_setting('app.locations', true)::jsonb))`;
        default:
          throw new Error(`Unknown user prop in SQL: ${node.prop}`);
      }
    case 'string':
      return `'${node.value.replace(/'/g, "''")}'`;
    case 'number':
      return String(node.value);
    case 'boolean':
      return node.value ? 'TRUE' : 'FALSE';
    case 'null':
      return 'NULL';
  }
}

function arrayToSql(node: ArrayNode | ValueNode): string {
  if ('kind' in node && node.kind === 'literal_array') {
    const vals = node.values.map((v) => valueToSql(v)).join(', ');
    return `(${vals})`;
  }
  if ('kind' in node && node.kind === 'user_prop' && node.prop === 'locations') {
    return `(SELECT jsonb_array_elements_text(current_setting('app.locations', true)::jsonb))`;
  }
  // Scalar used as array context — wrap in parens
  return `(${valueToSql(node as ValueNode)})`;
}

function nodeToSql(node: ExprNode): string {
  switch (node.type) {
    case 'always_true':
      return 'TRUE';
    case 'literal':
      return node.value ? 'TRUE' : 'FALSE';
    case 'eq':
      return `${valueToSql(node.left)} = ${valueToSql(node.right)}`;
    case 'neq':
      return `${valueToSql(node.left)} <> ${valueToSql(node.right)}`;
    case 'in':
      return `${valueToSql(node.value)} IN ${arrayToSql(node.array)}`;
  }
}

/**
 * Build a SQL WHERE fragment for all access rules for a user+table.
 * Rules are OR-ed together (any matching rule grants access).
 * Sorted by priority (ascending = higher priority first).
 *
 * Returns 'FALSE' when no rules apply (deny all).
 */
export function buildAccessFilter(
  rules: TableAccessRule[],
  user: { id: string; role: string; locations: string[] },
): string {
  const relevantRules = rules
    .filter((r) => r.roleId === user.role || r.roleId === '__all__')
    .sort((a, b) => a.priority - b.priority);

  if (relevantRules.length === 0) return 'FALSE';

  const fragments: string[] = [];
  for (const rule of relevantRules) {
    try {
      assertSafeExpression(rule.condition);
      const node = parseExpression(rule.condition);
      fragments.push(`(${nodeToSql(node)})`);
    } catch (err) {
      // Unsafe or unparseable condition → deny-all fragment
      console.warn(
        `[rule-engine] Skipping rule "${rule.id}" in SQL filter: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      fragments.push('FALSE');
    }
  }

  return fragments.join(' OR ');
}
