/**
 * Duplicate-detection engine for Novo platform.
 * Exact match uses SQL; fuzzy match uses inline Levenshtein.
 */

import { Pool } from 'pg';

export interface DedupRule {
  tableApiKey: string;
  matchFields: string[];     // fields to match on (e.g. ['email', 'phone'])
  matchType: 'exact' | 'fuzzy';
  fuzzyThreshold?: number;   // 0-1, default 0.85
  action: 'warn' | 'block' | 'merge';
}

export interface DedupResult {
  isDuplicate: boolean;
  confidence: number;        // 0-1
  existingRecordId?: string;
  matchedFields: string[];
  suggestion: 'skip' | 'merge' | 'create_anyway';
}

// ─── String distance helpers ──────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // dp[i][j] = edit distance between a[0..i-1] and b[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── Dedup check ──────────────────────────────────────────────────────────────

export async function checkDuplicate(
  record: Record<string, unknown>,
  rule: DedupRule,
  appId: string,
  tenantSlug: string,
  pgPool: Pool,
): Promise<DedupResult> {
  const schema = tenantSlug.replace(/[^a-z0-9_]/gi, '_');
  const threshold = rule.fuzzyThreshold ?? 0.85;

  if (rule.matchType === 'exact') {
    // Build SQL WHERE clause for exact match on all matchFields
    const conditions = rule.matchFields
      .filter((f) => record[f] !== undefined && record[f] !== null)
      .map((f, i) => `${JSON.stringify(f)} = $${i + 1}`);

    if (conditions.length === 0) {
      return { isDuplicate: false, confidence: 0, matchedFields: [], suggestion: 'create_anyway' };
    }

    const values = rule.matchFields
      .filter((f) => record[f] !== undefined && record[f] !== null)
      .map((f) => record[f]);

    const res = await pgPool.query<{ id: unknown }>(
      `SELECT id FROM ${JSON.stringify(schema)}.${JSON.stringify(rule.tableApiKey)} WHERE ${conditions.join(' AND ')} LIMIT 1`,
      values,
    );

    if (res.rows.length > 0) {
      return {
        isDuplicate: true,
        confidence: 1.0,
        existingRecordId: String(res.rows[0].id),
        matchedFields: rule.matchFields.filter((f) => record[f] !== undefined),
        suggestion: rule.action === 'merge' ? 'merge' : 'skip',
      };
    }
    return { isDuplicate: false, confidence: 0, matchedFields: [], suggestion: 'create_anyway' };
  }

  // Fuzzy match — load candidate rows and compute field-level similarity
  const res = await pgPool.query<Record<string, unknown>>(
    `SELECT * FROM ${JSON.stringify(schema)}.${JSON.stringify(rule.tableApiKey)} LIMIT 500`,
  );

  let bestScore = 0;
  let bestId: string | undefined;
  let bestMatchedFields: string[] = [];

  for (const row of res.rows) {
    const fieldScores: number[] = [];
    const matched: string[] = [];

    for (const field of rule.matchFields) {
      const a = String(record[field] ?? '');
      const b = String(row[field] ?? '');
      const score = similarity(a, b);
      fieldScores.push(score);
      if (score >= threshold) matched.push(field);
    }

    const avgScore = fieldScores.length > 0
      ? fieldScores.reduce((s, v) => s + v, 0) / fieldScores.length
      : 0;

    if (avgScore > bestScore) {
      bestScore = avgScore;
      bestId = String(row['id']);
      bestMatchedFields = matched;
    }
  }

  if (bestScore >= threshold) {
    return {
      isDuplicate: true,
      confidence: bestScore,
      existingRecordId: bestId,
      matchedFields: bestMatchedFields,
      suggestion: rule.action === 'merge' ? 'merge' : 'skip',
    };
  }

  return { isDuplicate: false, confidence: bestScore, matchedFields: [], suggestion: 'create_anyway' };
}

// ─── Rule storage helpers ─────────────────────────────────────────────────────

export async function getDedupRules(
  appId: string,
  tableApiKey: string,
  pgPool: Pool,
): Promise<DedupRule[]> {
  const res = await pgPool.query<{ config: Record<string, unknown> }>(
    `SELECT config FROM platform.table_configs WHERE app_id = $1 AND table_api_key = $2 LIMIT 1`,
    [appId, tableApiKey],
  );
  if (!res.rows[0]) return [];
  const rules = res.rows[0].config?.['dedup_rules'];
  return Array.isArray(rules) ? (rules as DedupRule[]) : [];
}

export async function saveDedupRules(
  appId: string,
  tableApiKey: string,
  rules: DedupRule[],
  pgPool: Pool,
): Promise<void> {
  await pgPool.query(
    `INSERT INTO platform.table_configs (app_id, table_api_key, config)
     VALUES ($1, $2, jsonb_build_object('dedup_rules', $3::jsonb))
     ON CONFLICT (app_id, table_api_key) DO UPDATE
       SET config = platform.table_configs.config || jsonb_build_object('dedup_rules', $3::jsonb)`,
    [appId, tableApiKey, JSON.stringify(rules)],
  );
}
