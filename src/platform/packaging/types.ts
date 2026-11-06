/**
 * App bundle types for the full packaging system.
 */

export interface BundledTable {
  slug: string;
  name: string;
  fields: unknown[];
  indexes: unknown[];
}

export interface BundledScript {
  name: string;
  code: string;
  inputSchema: unknown[];
  outputSchema: unknown[];
  testCases: unknown[];
}

export interface AppBundle {
  version: string;
  exportedAt: string;
  exportedBy: string;
  app: {
    name: string;
    slug: string;
    icon?: string;
    description?: string;
  };
  schema: {
    tables: BundledTable[];
    relations: unknown[];
    childTableConfigs: unknown[];
  };
  ui: {
    pages: unknown[];
    navItems: unknown[];
    theme?: unknown;
  };
  logic: {
    workflows: unknown[];
    approvalFlows: unknown[];
    schedules: unknown[];
    accessRules: unknown[];
    fieldPermissions: unknown[];
  };
  scripts: BundledScript[];
  integrations: {
    pdfTemplates: unknown[];
    emailTemplates: unknown[];
    stockConfigs: unknown[];
    fulfilmentConfigs: unknown[];
    convertToConfigs: unknown[];
    bomHeaders: unknown[];
    restConnectors: unknown[];
  };
  marketplace?: {
    id: string;
    name: string;
    category: string;
    tags: string[];
    screenshots: string[];
  };
}

export type AppPublishStatus = 'draft' | 'preview' | 'published';

export interface AppVersion {
  id: string;
  appId: string;
  version: string;
  status: AppPublishStatus | 'archived';
  bundle: AppBundle;
  publishedAt?: Date;
  publishedBy?: string;
  rollbackFrom?: string;
  createdAt: Date;
}

export type EnvironmentType = 'development' | 'staging' | 'production';

export interface AppEnvironment {
  id: string;
  appId: string;
  type: EnvironmentType;
  currentVersionId?: string;
  slug: string;
  createdAt: Date;
}

export interface ImportOptions {
  targetTenantSlug: string;
  newAppName?: string;
  newAppSlug?: string;
  skipExistingTables?: boolean;
  mergeMode: 'replace' | 'merge' | 'skip';
}

export interface ImportResult {
  appId: string;
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
  published_at: Date | null;
  published_by: string | null;
  rollback_from: string | null;
  created_at: Date;
}

export interface AppEnvironmentRow {
  id: string;
  app_id: string;
  type: string;
  current_version_id: string | null;
  slug: string;
  created_at: Date;
}
