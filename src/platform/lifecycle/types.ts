/**
 * Lifecycle types — app versioning, environments, export/import.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppBundle = Record<string, any>;

export type AppStatus = 'draft' | 'published' | 'active' | 'archived';

export interface AppVersion {
  id: string;
  appId: string;
  versionNumber: number;
  semver?: string;
  label?: string;
  status: AppStatus;
  bundle: AppBundle;
  publishedAt?: Date;
  rollbackFrom?: string;
  createdAt: Date;
  createdBy: string;
}

export interface AppVersionRow {
  id: string;
  app_id: string;
  version_number: number;
  semver?: string;
  label?: string;
  status: AppStatus;
  bundle: AppBundle;
  published_at?: Date;
  rollback_from?: string;
  created_at: Date;
  created_by: string;
}

export type EnvironmentName = 'staging' | 'production' | 'development' | string;

export interface AppEnvironment {
  id?: string;
  appId: string;
  name: EnvironmentName;
  currentVersionId?: string;
  settings?: Record<string, unknown>;
  updatedAt?: Date;
}

export interface AppEnvironmentRow {
  id?: string;
  app_id: string;
  name: EnvironmentName;
  current_version_id?: string;
  settings?: Record<string, unknown>;
  updated_at?: Date;
}
