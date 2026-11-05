/**
 * App package types for export/import.
 */

import type { AppDefinition, TableDef } from '../contracts/tables.js';
import type { PageDef } from '../contracts/ui.js';
import type { WorkflowDef, ScriptDef } from '../contracts/rules.js';
import type { PdfTemplate } from '../documents/types.js';

export interface AppPackage {
  version: string;
  exportedAt: string;
  app: AppDefinition;
  tables: TableDef[];
  pages: PageDef[];
  workflows: WorkflowDef[];
  scripts: ScriptDef[];
  templates: PdfTemplate[];
}

export interface ImportResult {
  appId: string;
  warnings: string[];
}

export interface AppVersionRow {
  id: string;
  tenant_slug: string;
  app_id: string;
  label: string;
  snapshot: AppPackage;
  created_by: string | null;
  created_at: Date;
}
