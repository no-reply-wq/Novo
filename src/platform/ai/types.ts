/**
 * AI App Generator types for the Novo platform.
 */

export interface AppGenerationRequest {
  description: string; // "I want an inventory management system with suppliers, purchase orders, and stock tracking"
  tenantSlug: string;
  userId: string;
}

export interface GeneratedAppDraft {
  id: string;
  tenantSlug: string;
  status: 'draft' | 'reviewing' | 'published';
  description: string;
  app: {
    name: string;
    slug: string;
    description: string;
    icon: string;
  };
  tables: GeneratedTable[];
  pages: GeneratedPage[];
  workflows: GeneratedWorkflow[];
  generatedAt: string;
  promptTokens: number;
  completionTokens: number;
}

export interface GeneratedTable {
  name: string;
  slug: string;
  description: string;
  fields: GeneratedField[];
  relations: GeneratedRelation[];
  hasStock?: boolean; // enable stock engine
  hasFulfilment?: boolean; // enable fulfilment engine
}

export interface GeneratedField {
  name: string;
  apiKey: string;
  type: string; // from the platform field types
  required?: boolean;
  options?: string[]; // for dropdown/select
  formula?: string; // for computed fields
}

export interface GeneratedRelation {
  name: string;
  targetTable: string;
  type: 'one_to_many' | 'many_to_many';
}

export interface GeneratedPage {
  name: string;
  slug: string;
  description: string;
  components: GeneratedComponent[];
}

export interface GeneratedComponent {
  type: 'table' | 'form' | 'statcard' | 'kanban' | 'chart';
  title: string;
  dataSource?: string; // which table/query
  config?: Record<string, unknown>;
}

export interface GeneratedWorkflow {
  name: string;
  trigger: string; // e.g. "record_created:purchase_orders"
  description: string;
  steps: string[]; // human-readable step descriptions
}
