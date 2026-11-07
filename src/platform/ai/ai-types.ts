/**
 * AI App Generator types (Wave 5 — Agent R).
 */

export interface AiGeneratorRequest {
  description: string;
  industry?: string;
  existingTables?: string[];
}

export interface AiGeneratorDraft {
  appName: string;
  description: string;
  tables: AiTableDraft[];
  pages: AiPageDraft[];
  workflows: AiWorkflowDraft[];
  warnings: string[];
}

export interface AiTableDraft {
  name: string;
  apiKey: string;
  description: string;
  fields: AiFieldDraft[];
  relations: AiRelationDraft[];
}

export interface AiFieldDraft {
  name: string;
  apiKey: string;
  type: string;
  required?: boolean;
  options?: string[];
  formula?: string;
}

export interface AiRelationDraft {
  name: string;
  targetTable: string;
  type: 'one_to_many' | 'many_to_many';
}

export interface AiPageDraft {
  name: string;
  type: 'list' | 'form' | 'detail' | 'dashboard';
  primaryTable: string;
}

export interface AiWorkflowDraft {
  name: string;
  trigger: string;
  description: string;
}
