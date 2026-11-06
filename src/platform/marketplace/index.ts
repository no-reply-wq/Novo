/**
 * Template marketplace — public API.
 */

export { crmTemplate } from './templates/crm-template';
export { inventoryTemplate } from './templates/inventory-template';
export { hrmsTemplate } from './templates/hrms-template';
export type { AppTemplate, TemplateCategory } from './types';

import { crmTemplate } from './templates/crm-template';
import { inventoryTemplate } from './templates/inventory-template';
import { hrmsTemplate } from './templates/hrms-template';
import type { AppTemplate, TemplateCategory } from './types';

export const ALL_TEMPLATES: AppTemplate[] = [
  crmTemplate,
  inventoryTemplate,
  hrmsTemplate,
];

export function getTemplateBySlug(slug: string): AppTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.slug === slug);
}

export function getTemplatesByCategory(category: TemplateCategory): AppTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.category === category);
}
