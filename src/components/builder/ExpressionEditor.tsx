'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  autocompletion,
  completionKeymap,
  CompletionContext,
  Completion,
} from '@codemirror/autocomplete';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { ExprParseError } from '@/platform/expr/index';
import { parseExpression } from '@/platform/expr/parser';
import engine from '@/platform/expr/engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'array'
  | 'object'
  | 'any';

export interface FieldHint {
  apiKey: string;
  label: string;
  type: FieldType;
}

export interface ExpressionEditorProps {
  value: string;
  onChange: (v: string) => void;
  fieldHints?: FieldHint[];
  /** Called whenever the SQL-transpilability of the expression changes.
   *  `null` = expression is SQL-transpilable (or empty).
   *  `string` = human-readable reason it cannot be transpiled to SQL RLS. */
  onSqlWarning?: (warning: string | null) => void;
  error?: string;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  rows?: number;
}

// ─── Syntax highlight style ───────────────────────────────────────────────────

const exprHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--expr-keyword, #7c3aed)' },
  { tag: tags.string, color: 'var(--expr-string, #059669)' },
  { tag: tags.number, color: 'var(--expr-number, #d97706)' },
  { tag: tags.bool, color: 'var(--expr-bool, #0ea5e9)' },
  { tag: tags.null, color: 'var(--expr-null, #94a3b8)' },
  { tag: tags.operator, color: 'var(--expr-op, #e11d48)' },
  { tag: tags.function(tags.variableName), color: 'var(--expr-fn, #2563eb)' },
  { tag: tags.variableName, color: 'var(--expr-var, #0f172a)' },
  { tag: tags.comment, color: 'var(--expr-comment, #94a3b8)', fontStyle: 'italic' },
]);

// ─── Built-in function names for autocomplete ─────────────────────────────────

const BUILTIN_FUNCTIONS: Completion[] = [
  'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'CEIL', 'FLOOR', 'ABS',
  'IF', 'IFS', 'SWITCH', 'COALESCE', 'NULLIF',
  'CONCAT', 'TRIM', 'UPPER', 'LOWER', 'LEFT', 'RIGHT', 'MID', 'LEN',
  'REPLACE', 'CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'SPLIT', 'JOIN',
  'DATE_DIFF', 'DATE_ADD', 'FORMAT_DATE', 'YEAR', 'MONTH', 'DAY',
  'TODAY', 'NOW', 'WEEKDAY',
  'SUMIF', 'COUNTIF', 'AVGIF', 'COUNT', 'COUNT_DISTINCT',
  'LOOKUP', 'TEXT', 'NUMBER', 'BOOLEAN', 'IS_NULL', 'IS_BLANK', 'TYPE_OF',
  'FILTER', 'MAP', 'FIND', 'EVERY', 'SOME', 'FLAT', 'UNIQUE', 'SORT_BY',
  'SEQUENCE',
].map((name) => ({
  label: name,
  type: 'function',
  apply: `${name}(`,
  detail: 'built-in',
}));

// ─── EditorView theme ─────────────────────────────────────────────────────────

const editorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    borderRadius: '6px',
    border: '1px solid var(--border, #e2e8f0)',
    background: 'var(--input-bg, #f8fafc)',
    minHeight: '38px',
    maxHeight: '200px',
    overflow: 'auto',
  },
  '&.cm-focused': {
    outline: '2px solid var(--ring, #6366f1)',
    outlineOffset: '1px',
  },
  '.cm-content': {
    padding: '8px 10px',
    color: 'var(--foreground, #0f172a)',
    caretColor: 'var(--foreground, #0f172a)',
  },
  '.cm-line': { padding: '0' },
  '.cm-activeLine': { background: 'var(--accent-muted, rgba(99,102,241,0.05))' },
  '.cm-gutters': {
    background: 'var(--input-bg, #f8fafc)',
    border: 'none',
    color: 'var(--muted, #94a3b8)',
    paddingRight: '4px',
  },
  '.cm-cursor': { borderLeftColor: 'var(--foreground, #0f172a)' },
  '.cm-tooltip': {
    background: 'var(--popover-bg, #fff)',
    border: '1px solid var(--border, #e2e8f0)',
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  },
  '.cm-tooltip-autocomplete > ul': { maxHeight: '200px' },
  '.cm-tooltip-autocomplete > ul > li': {
    padding: '4px 10px',
    color: 'var(--foreground, #0f172a)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: 'var(--accent, #6366f1)',
    color: '#fff',
  },
});

// ─── Component ────────────────────────────────────────────────────────────────

export function ExpressionEditor({
  value,
  onChange,
  fieldHints,
  onSqlWarning,
  error,
  placeholder,
  readOnly = false,
  className = '',
}: ExpressionEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const fieldHintsRef = useRef(fieldHints ?? []);

  // keep refs up to date without recreating the editor (useLayoutEffect avoids render-time mutation)
  React.useLayoutEffect(() => {
    onChangeRef.current = onChange;
    fieldHintsRef.current = fieldHints ?? [];
  });

  // Parse error from the platform expression parser
  const [parseError, setParseError] = React.useState<string | null>(null);
  // SQL-transpilability warning (null = transpilable or empty)
  const [sqlWarning, setSqlWarning] = React.useState<string | null>(null);
  const onSqlWarningRef = React.useRef(onSqlWarning);
  React.useLayoutEffect(() => { onSqlWarningRef.current = onSqlWarning; });

  const validateValue = useCallback((src: string) => {
    if (!src.trim()) {
      setParseError(null);
      setSqlWarning(null);
      onSqlWarningRef.current?.(null);
      return;
    }
    try {
      const compiled = parseExpression(src);
      setParseError(null);
      // Check SQL transpilability
      try {
        const fragment = engine.toSql(engine.parse(src), {});
        const warn = fragment === null
          ? 'This expression uses functions that cannot be translated to SQL. The policy will DENY ALL access as a safe fallback until a transpilable expression is used.'
          : null;
        setSqlWarning(warn);
        onSqlWarningRef.current?.(warn);
      } catch {
        // toSql errors also mean non-transpilable
        const warn = 'This expression cannot be translated to SQL. The policy will DENY ALL access as a safe fallback.';
        setSqlWarning(warn);
        onSqlWarningRef.current?.(warn);
      }
      void compiled; // used by parseExpression above
    } catch (e) {
      if (e instanceof ExprParseError && e.errors.length > 0) {
        const first = e.errors[0];
        const pos = first.position !== undefined ? ` (pos ${first.position})` : '';
        setParseError(first.message + pos);
      } else {
        setParseError(String(e));
      }
      setSqlWarning(null);
      onSqlWarningRef.current?.(null);
    }
  }, []);

  // Field + function autocomplete source
  const completionSource = useCallback(
    (ctx: CompletionContext) => {
      const word = ctx.matchBefore(/[\w.]+/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;

      const fieldCompletions: Completion[] = fieldHintsRef.current.map((f) => ({
        label: f.apiKey,
        displayLabel: `${f.apiKey} — ${f.label}`,
        type: 'variable',
        detail: f.type,
      }));

      const options = [...fieldCompletions, ...BUILTIN_FUNCTIONS];
      return { from: word.from, options };
    },
    [],
  );

  // Create the editor once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        lineNumbers(),
        highlightActiveLine(),
        syntaxHighlighting(exprHighlight),
        autocompletion({ override: [completionSource], activateOnTyping: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const src = update.state.doc.toString();
            onChangeRef.current(src);
            validateValue(src);
          }
        }),
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    // validate initial value
    validateValue(value);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally mount-once

  // Sync external value changes into the editor (e.g. form reset)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  const displayError = error ?? parseError;

  return (
    <div className={`expr-editor-wrapper ${className}`} data-testid="expression-editor">
      {placeholder && !value && (
        <div className="expr-placeholder" aria-hidden="true">
          {placeholder}
        </div>
      )}
      <div ref={containerRef} className="expr-editor-container" />
      {displayError && (
        <p
          className="expr-error"
          role="alert"
          data-testid="expr-error"
          style={{
            margin: '4px 0 0',
            fontSize: '12px',
            color: 'var(--destructive, #dc2626)',
            display: 'flex',
            gap: '4px',
            alignItems: 'flex-start',
          }}
        >
          <span aria-hidden="true">⚠</span> {displayError}
        </p>
      )}
      {!displayError && sqlWarning && (
        <p
          className="expr-sql-warning"
          role="alert"
          data-testid="expr-sql-warning"
          style={{
            margin: '4px 0 0',
            fontSize: '12px',
            color: 'var(--warning-fg, #92400e)',
            background: 'var(--warning-bg, #fef3c7)',
            border: '1px solid var(--warning-border, #fcd34d)',
            borderRadius: '4px',
            padding: '4px 8px',
            display: 'flex',
            gap: '4px',
            alignItems: 'flex-start',
          }}
        >
          <span aria-hidden="true">⚠</span> {sqlWarning}
        </p>
      )}
      <style>{`
        .expr-editor-wrapper { position: relative; width: 100%; }
        .expr-placeholder {
          position: absolute;
          top: 10px;
          left: 10px;
          color: var(--muted, #94a3b8);
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          pointer-events: none;
          z-index: 1;
        }
        .expr-editor-container .cm-editor { width: 100%; }
      `}</style>
    </div>
  );
}

export default ExpressionEditor;
