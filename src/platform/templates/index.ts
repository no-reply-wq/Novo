/**
 * Template registry for the Novo platform template gallery.
 * Exports all available templates and helper functions.
 */

import type { AppTemplate } from './types';
import { lmsTemplate } from './lms';
import { hrmsTemplate } from './hrms';
import { crmTemplate } from './crm';

export { lmsTemplate } from './lms';
export { hrmsTemplate } from './hrms';
export { crmTemplate } from './crm';
export type { AppTemplate } from './types';

export const TEMPLATES: AppTemplate[] = [
  lmsTemplate,
  hrmsTemplate,
  crmTemplate,
  // future: erpTemplate (Colorplas-style)
];

/**
 * Retrieve a template by its unique id.
 * Returns undefined if no template matches.
 */
export function getTemplate(id: string): AppTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * List templates, optionally filtered by category.
 */
export function listTemplates(category?: string): AppTemplate[] {
  if (!category) return TEMPLATES;
  return TEMPLATES.filter((t) => t.category === category);
}
