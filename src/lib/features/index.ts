export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  category: 'module' | 'feature';
}

export const ALL_MODULES: FeatureDef[] = [
  { key: 'leads',           label: 'CRM / Leads',       description: 'Lead and opportunity management',       category: 'module' },
  { key: 'quotations',      label: 'Quotations',         description: 'Create and send quotations',           category: 'module' },
  { key: 'sales-orders',    label: 'Sales Orders',       description: 'Sales order management',               category: 'module' },
  { key: 'indents',         label: 'Indents',            description: 'Purchase requisitions',                category: 'module' },
  { key: 'purchase-orders', label: 'Purchase Orders',    description: 'Purchase order management',            category: 'module' },
  { key: 'goods-receipts',  label: 'Goods Receipts',     description: 'GRN and goods receipt',                category: 'module' },
  { key: 'inventory',       label: 'Inventory',          description: 'Stock and warehouse management',       category: 'module' },
  { key: 'expenses',        label: 'Expenses',           description: 'Expense management',                   category: 'module' },
  { key: 'masters',         label: 'Masters',            description: 'Clients, vendors, products etc.',      category: 'module' },
];

export const ALL_FEATURES: FeatureDef[] = [
  { key: 'form_builder', label: 'Form Builder',  description: 'Build custom data-entry forms',     category: 'feature' },
  { key: 'ui_builder',   label: 'UI Builder',    description: 'Drag-and-drop page builder',        category: 'feature' },
  { key: 'whatsapp',     label: 'WhatsApp API',  description: 'Send WhatsApp notifications',       category: 'feature' },
  { key: 'email',        label: 'Email API',     description: 'Send email via SMTP',               category: 'feature' },
  { key: 'api_access',   label: 'API Access',    description: 'Programmatic API access',           category: 'feature' },
  { key: 'reports',      label: 'Reports',       description: 'Advanced reporting',                category: 'feature' },
];

export const ALL_ITEMS = [...ALL_MODULES, ...ALL_FEATURES];

export function hasFeature(allowedFeatures: string[], featureKey: string): boolean {
  if (!allowedFeatures || allowedFeatures.length === 0) return true;
  return allowedFeatures.includes(featureKey);
}

export function isModuleVisible(hiddenModules: string[], moduleKey: string): boolean {
  return !hiddenModules.includes(moduleKey);
}
