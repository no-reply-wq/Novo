/**
 * Email template renderer — simple {{fieldName}} substitution.
 *
 * Replaces {{fieldName}} tokens in both subject and HTML with values
 * from the data record. Missing keys are replaced with empty string.
 * Does not evaluate expressions or allow nested accessors —
 * intentionally simple and safe.
 */

const TOKEN_RE = /\{\{([^{}]+?)\}\}/g;

/**
 * Render an email template by substituting {{fieldName}} tokens.
 *
 * @param template  Template with {{fieldName}} placeholders in subject and html
 * @param data      Record of field values to substitute
 * @returns         Rendered subject and HTML strings
 */
export function renderEmailTemplate(
  template: { subject: string; html: string },
  data: Record<string, unknown>
): { subject: string; html: string } {
  const replace = (input: string): string =>
    input.replace(TOKEN_RE, (_match, key: string) => {
      const trimmed = key.trim();
      const value = data[trimmed];
      if (value === null || value === undefined) return '';
      return String(value);
    });

  return {
    subject: replace(template.subject),
    html: replace(template.html),
  };
}
