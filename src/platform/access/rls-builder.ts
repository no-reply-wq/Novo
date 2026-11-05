/**
 * rls-builder.ts
 *
 * Compiles AccessPolicy objects into Postgres CREATE POLICY DDL.
 *
 * Wave 1 scope: expressions that can be translated to SQL by ExprEngine.toSql()
 * are embedded directly. Expressions that cannot be translated (toSql returns null)
 * are logged as warnings and produce a DENY-all policy (USING (false)).
 *
 * TODO(Lead/Agent B): Replace the USING(false) fallback with a pg_notify-based
 * callback to the Node expr engine once Agent B implements that path.
 */

import type { AccessPolicy } from '@/platform/contracts';
import type { ExprEngine, ExprType } from '@/platform/expr';

export interface RlsSql {
  policyName: string;
  createSql: string;
  dropSql: string;
}

/** Allowed operation values per Postgres syntax */
const PG_OPERATION: Record<AccessPolicy['operation'], string> = {
  select: 'SELECT',
  insert: 'INSERT',
  update: 'UPDATE',
  delete: 'DELETE',
  all: 'ALL',
};

/**
 * Sanitize a policy id so it is safe for use as a Postgres identifier.
 * Only alphanumeric and hyphens/underscores are allowed; anything else is stripped.
 * The result is then quoted with double-quotes for safety.
 */
function sanitizePolicyId(id: string): string {
  // Allow only alphanumeric, hyphens, underscores — prevents injection via policy id
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safe.length === 0) {
    throw new Error(`AccessPolicy id "${id}" produced an empty sanitized identifier`);
  }
  return safe;
}

/**
 * Sanitize a table name for use as a Postgres identifier.
 * Table names may be schema-qualified (schema.table).
 */
function sanitizeTableName(tableId: string): string {
  // Accept schema.table or plain table; each segment must be safe
  const parts = tableId.split('.');
  for (const part of parts) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part)) {
      throw new Error(`tableId "${tableId}" contains unsafe characters`);
    }
  }
  return parts.map((p) => `"${p}"`).join('.');
}

/**
 * Build a single RLS policy from an AccessPolicy descriptor.
 *
 * @param policy      - the AccessPolicy to compile
 * @param fieldTypes  - map of field apiKey → ExprType, used by the expr engine
 * @param engine      - ExprEngine instance provided by dependency injection
 * @returns RlsSql    - { policyName, createSql, dropSql }
 */
export function buildRlsPolicy(
  policy: AccessPolicy,
  fieldTypes: Record<string, ExprType>,
  engine: ExprEngine,
): RlsSql {
  const safePolicyId = sanitizePolicyId(policy.id);
  const policyName = `novo_${safePolicyId}`;
  const quotedPolicyName = `"${policyName}"`;
  const tableName = sanitizeTableName(policy.tableId);
  const operation = PG_OPERATION[policy.operation];

  let usingSql: string;

  if (!policy.condition || policy.condition.trim() === '') {
    // Empty condition = deny all
    usingSql = 'false';
  } else {
    // Attempt to translate the expression to SQL
    let fragment: ReturnType<ExprEngine['toSql']>;
    try {
      const compiled = engine.parse(policy.condition);
      fragment = engine.toSql(compiled, fieldTypes);
    } catch (err) {
      // Parse error — treat as untranslatable; deny and warn
      console.warn(
        `[rls-builder] Policy "${policy.id}" condition parse error; falling back to DENY. Error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      fragment = null;
    }

    if (fragment === null) {
      // Wave 1 fallback: cannot translate → deny and warn
      console.warn(
        `[rls-builder] Policy "${policy.id}" condition cannot be translated to SQL; ` +
          `falling back to USING (false) (deny-all). ` +
          `TODO: replace with pg_notify callback once Agent B implements it.`,
      );
      usingSql = 'false';
    } else {
      // Params in SqlFragment are safe — they come from the expr engine which validates types.
      // However, for USING clauses we cannot use parameterised queries because CREATE POLICY
      // is DDL. We embed literal values only after type validation.
      usingSql = embedParams(fragment.sql, fragment.params);
    }
  }

  // Choose the right clause keyword:
  // INSERT uses WITH CHECK, not USING.
  // For simplicity in Wave 1 we emit USING for all ops including INSERT.
  // TODO(Lead): emit WITH CHECK for insert/update when Agent B confirms expr semantics.
  const clause = policy.operation === 'insert' ? `WITH CHECK (${usingSql})` : `USING (${usingSql})`;

  const createSql =
    `CREATE POLICY ${quotedPolicyName} ON ${tableName} ` +
    `FOR ${operation} TO tenant_app_role ` +
    `${clause};`;

  const dropSql = `DROP POLICY IF EXISTS ${quotedPolicyName} ON ${tableName};`;

  return { policyName, createSql, dropSql };
}

/**
 * Embed params from a SqlFragment into the SQL string for DDL use.
 *
 * We only embed values that the expr engine explicitly typed as ExprScalar
 * (string, number, boolean, null, Date). Strings are escaped with single-quote
 * doubling (standard SQL). We NEVER call eval or template user input directly.
 */
function embedParams(sql: string, params: Array<string | number | boolean | null | Date>): string {
  let i = 0;
  return sql.replace(/\$(\d+)/g, (match, numStr) => {
    const idx = parseInt(numStr, 10) - 1;
    if (idx < 0 || idx >= params.length) {
      throw new Error(`SQL fragment references $${numStr} but params has ${params.length} elements`);
    }
    const val = params[idx];
    i++;
    return pgLiteral(val);
  });
}

function pgLiteral(val: string | number | boolean | null | Date): string {
  if (val === null) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') {
    // Reject NaN/Infinity — not valid Postgres literals
    if (!isFinite(val)) throw new Error(`Cannot embed non-finite number ${val} in SQL`);
    return String(val);
  }
  if (val instanceof Date) {
    return `'${val.toISOString()}'`;
  }
  // String: escape single quotes by doubling them (standard SQL)
  const escaped = String(val).replace(/'/g, "''");
  return `'${escaped}'`;
}

/**
 * Build an array of RLS policies and return them as a single transactional DDL block.
 */
export function buildRlsPolicies(
  policies: AccessPolicy[],
  fieldTypes: Record<string, ExprType>,
  engine: ExprEngine,
): { transactionSql: string; policies: RlsSql[] } {
  const results = policies.map((p) => buildRlsPolicy(p, fieldTypes, engine));
  const lines: string[] = ['BEGIN;'];
  for (const r of results) {
    lines.push(r.dropSql);
    lines.push(r.createSql);
  }
  lines.push('COMMIT;');
  return { transactionSql: lines.join('\n'), policies: results };
}
