/**
 * App bundle types for the full packaging system.
 * Supports export/import, Draft→Preview→Publish lifecycle,
 * and dev/staging/production environments.
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
  version: string;          // semver: '1.0.0'
  exportedAt: string;       // ISO date
  exportedBy: string;       // user ID
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
    restConnectors: unknown[]; // secrets excluded
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
  rollbackFrom?: string;   // previous version ID
  createdAt: Date;
}

export type EnvironmentType = 'development' | 'staging' | 'production';

export interface AppEnvironment {
  id: string;
  appId: string;
  type: EnvironmentType;
  currentVersionId?: string;
  slug: string;             // app slug for this env: myapp-dev, myapp-staging, myapp
  createdAt: Date;
}

export interface ImportOptions {
  targetTenantSlug: string;
  newAppName?: string;       // override bundle's app name
  newAppSlug?: string;       // override slug (must be unique)
  skipExistingTables?: boolean;
  mergeMode: 'replace' | 'merge' | 'skip'; // what to do if app already exists
}

export interface ImportResult {
  appId: string;
  tablesCreated: number;
  pagesCreated: number;
  workflowsCreated: number;
  scriptsCreated: number;
  warnings: string[];        // e.g. "Secret 'api_key' was not imported"
}

// DB row types

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
