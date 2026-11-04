/**
 * MODULE constants — canonical module keys used in requirePermission().
 * Extend this list when adding new modules; never use inline strings.
 */
export const MODULE = {
  FORM_BUILDER: 'form_builder',
  UI_BUILDER: 'ui_builder',
  PURCHASE: 'purchase',
  QUOTATIONS: 'quotations',
  SALES_ORDERS: 'sales_orders',
  INVENTORY: 'inventory',
  EXPENSES: 'expenses',
  REPORTS: 'reports',
  INTEGRATIONS: 'integrations',
  SETTINGS: 'settings',
  TABLES: 'tables',
  WORKFLOWS: 'workflows',
  NAV: 'nav',
  UPLOAD: 'upload',
  RELATIONS: 'relations',
  ROWS: 'rows',
  FIELDS: 'fields',
  FORMS: 'forms',
  PDF: 'pdf',
  NOTIFICATIONS: 'notifications',
  SEARCH: 'search',
} as const;

export type ModuleKey = (typeof MODULE)[keyof typeof MODULE];
