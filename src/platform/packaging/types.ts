/**
 * Types for Wave 12 app packaging: export/import, versioning, environments.
 */

export type AppPublishStatus = 'draft' | 'preview' | 'published';

export interface BundledTable {
  _originalId: string;
  name: string;
  display_name: string;
  config: Record<string, unknown>;
  fields: unknown[];
  relations: unknown[];
  childConfigs: unknown[];
}

export interface BundledScript {
  name: string;
  code: string;
  trigger_type: string;
  config: Record<string, unknown>;
}

export interface AppBundle {
  bundleVersion: 1;
  exportedAt: string;
  exportedBy?: string;
  appId: string;
  appName: string;
  appSlug: string;
  version: string;
  schema: {
    tables: BundledTable[];
  };
  ui: {
    pages: unknown[];
    navItems: unknown[];
    theme: unknown;
  };
  logic: {
    workflows: unknown[];
    approvalFlows: unknown[];
    schedules: unknown[];
    accessRules: unknown[];
    fieldPermissions: unknown[];
  };
  scripts: BundledScript[];
  templates: {
    pdf: unknown[];
    email: unknown[];
  };
  integrations: {
    stockConfigs: unknown[];
    fulfilmentConfigs: unknown[];
    convertToConfigs: unknown[];
    bomHeaders: unknown[];
    restConnectors: Array<Record<string, unknown>>;
  };
}

export interface AppVersion {
  id: string;
  appId: string;
  version: string;
  status: AppPublishStatus | 'archived';
  bundle: AppBundle;
  publishedAt?: string;
  publishedBy?: string;
  rollbackFrom?: string;
  createdAt: string;
}

export type EnvironmentType = 'development' | 'staging' | 'production';

export interface AppEnvironment {
  id: string;
  appId: string;
  type: EnvironmentType;
  currentVersionId?: string;
  slug: string;
}

export interface ImportOptions {
  tenant: string;
  newAppName?: string;
  newAppSlug?: string;
  mergeMode: 'replace' | 'merge' | 'skip';
  skipExistingTables?: boolean;
}

export interface ImportResult {
  appId: string;
  appName: string;
  tablesCreated: number;
  pagesCreated: number;
  workflowsCreated: number;
  scriptsCreated: number;
  warnings: string[];
}

export interface AppVersionRow {
  id: string;
  app_id: string;
  version: string;
  status: string;
  bundle: AppBundle;
  published_at: string | null;
  published_by: string | null;
  rollback_from: string | null;
  created_at: string;
}

export interface AppEnvironmentRow {
  id: string;
  app_id: string;
  type: string;
  current_version_id: string | null;
  slug: string;
}
