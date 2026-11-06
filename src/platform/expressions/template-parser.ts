/**
 * Template parser for {{ }} expressions.
 *
 * Parses strings like:
 *   "Invoice #{{ auto_number }} for {{ customer.name }}"
 * and evaluates each {{ }} block, interpolating results into the string.
 *
 * Security: delegates to the evaluator which enforces all safety limits.
 * No eval(), Function(), new Function().
 */

import { evaluateExpression, evaluateSafeExpression, EvalContext } from './evaluator';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextSegment {
  type: 'text';
  value: string;
}

interface ExprSegment {
  type: 'expr';
  source: string;
  start: number;
  end: number;
}

type Segment = TextSegment | ExprSegment;

// ─── Segment extractor ────────────────────────────────────────────────────────

export function extractSegments(template: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  while (i < template.length) {
    const open = template.indexOf('{{', i);
    if (open === -1) {
      // rest is literal text
      segments.push({ type: 'text', value: template.slice(i) });
      break;
    }
    // text before opening
    if (open > i) {
      segments.push({ type: 'text', value: template.slice(i, open) });
    }
    const close = template.indexOf('}}', open + 2);
    if (close === -1) {
      // unclosed expression — treat rest as text
      segments.push({ type: 'text', value: template.slice(open) });
      break;
    }
    const source = template.slice(open + 2, close).trim();
    segments.push({ type: 'expr', source, start: open, end: close + 2 });
    i = close + 2;
  }

  return segments;
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // ISO date string without time for clean display
    return v.toISOString().slice(0, 10);
  }
  if (Array.isArray(v)) return v.map(renderValue).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a template string, replacing {{ expr }} blocks with their values.
 * Throws on parse or security errors.
 */
export function renderTemplate(template: string, context: EvalContext): string {
  const segments = extractSegments(template);
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.type === 'text') {
      parts.push(seg.value);
    } else {
      const value = evaluateExpression(seg.source, context);
      parts.push(renderValue(value));
    }
  }
  return parts.join('');
}

/**
 * Safe version — never throws; errors within {{ }} produce empty string.
 * Returns the rendered string and an array of any errors encountered.
 */
export function renderTemplateSafe(
  template: string,
  context: EvalContext,
): { result: string; errors: Array<{ source: string; error: string }> } {
  const segments = extractSegments(template);
  const parts: string[] = [];
  const errors: Array<{ source: string; error: string }> = [];

  for (const seg of segments) {
    if (seg.type === 'text') {
      parts.push(seg.value);
    } else {
      const { value, error } = evaluateSafeExpression(seg.source, context);
      if (error) {
        errors.push({ source: seg.source, error });
        parts.push(''); // blank on error
      } else {
        parts.push(renderValue(value));
      }
    }
  }

  return { result: parts.join(''), errors };
}

/**
 * Extract all expression sources from a template, without evaluating.
 * Useful for syntax validation and autocomplete.
 */
export function extractExpressions(template: string): string[] {
  return extractSegments(template)
    .filter((s): s is ExprSegment => s.type === 'expr')
    .map(s => s.source);
}
