/**
 * Handlebars template rendering for email bodies.
 */

import Handlebars from 'handlebars';

// Register helpers
Handlebars.registerHelper('formatDate', (date: unknown) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(String(date));
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
});

Handlebars.registerHelper('upper', (str: unknown) => String(str ?? '').toUpperCase());
Handlebars.registerHelper('lower', (str: unknown) => String(str ?? '').toLowerCase());

export function renderEmailTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  const compiled = Handlebars.compile(template, { noEscape: false });
  return compiled(data);
}
