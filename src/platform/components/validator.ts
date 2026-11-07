// Validates custom component ESM code before saving

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MAX_CODE_BYTES = 50 * 1024;

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\brequire\s*\(/, label: "require()" },
  { pattern: /\b__dirname\b/, label: "__dirname" },
  { pattern: /\b__filename\b/, label: "__filename" },
  { pattern: /\bprocess\s*[.[\]]/, label: "process" },
  { pattern: /\bglobal\s*[.[\]]/, label: "global" },
  { pattern: /\bglobalThis\s*[.[\]]/, label: "globalThis (direct member access)" },
  { pattern: /\beval\s*\(/, label: "eval()" },
  { pattern: /\bnew\s+Function\s*\(/, label: "new Function()" },
];

const DEFAULT_EXPORT_PATTERNS: RegExp[] = [
  /export\s+default\s+/,
  /export\s*\{[^}]*\bdefault\b[^}]*\}/,
];

function hasDefaultExport(code: string): boolean {
  return DEFAULT_EXPORT_PATTERNS.some((p) => p.test(code));
}

function checkSyntax(code: string): string | null {
  try {
    // Strip module-level export keywords so Function() constructor does not choke on them
    const stripped = code
      .replace(/^export\s+default\s+/mg, '')
      .replace(/^export\s+\{[^}]*\}/mg, '')
      .replace(/^export\s+(const|let|var|function|class)\s+/mg, "$1 ")
      .replace(/<\/[\w.:-]+(\s[^>]*)?>/g, '"__JSX__"')
      .replace(/<[\w.:-]+(\s[^>]*)?\s*\/>/g, '"__JSX__"')
      .replace(/<>/g, '"__FRAG__"')
      .replace(/<\/>/g, '"__FRAG_END__"');
    // eslint-disable-next-line no-new-func
    new Function(stripped);
    return null;
  } catch (err) {
    return err instanceof SyntaxError ? err.message : String(err);
  }
}

export async function validateComponentCode(code: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const bytes = Buffer.byteLength(code, "utf8");
  if (bytes > MAX_CODE_BYTES) {
    errors.push(`Code exceeds 50 KB limit (got ${(bytes / 1024).toFixed(1)} KB)`);
  }

  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(`Forbidden expression: ${label}`);
    }
  }

  if (!hasDefaultExport(code)) {
    errors.push("Component must have a default export (export default MyComponent)");
  }

  if (bytes <= MAX_CODE_BYTES) {
    const syntaxErr = checkSyntax(code);
    if (syntaxErr) {
      errors.push(`Syntax error: ${syntaxErr}`);
    }
  }

  if (/\bfetch\s*\(/.test(code)) {
    warnings.push("Direct fetch() detected -- ensure the URL is allowlisted for the tenant");
  }

  return { valid: errors.length === 0, errors, warnings };
}
