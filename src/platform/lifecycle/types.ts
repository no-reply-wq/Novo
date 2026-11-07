/**
 * Lifecycle types — app versioning, environments, export/import.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppBundle = Record<string, any>;

export type AppStatus = 'draft' | 'active' | 'archived';

export interface AppVersion {
  id: string;
  appId: string;
  semver: string;
  label?: string;
  status: AppStatus;
  createdAt: Date;
  createdBy: string;
}

export interface AppVersionRow {
  id: string;
  app_id: string;
  semver: string;
  label?: string;
  status: AppStatus;
  bundle: AppBundle;
  created_at: Date;
  created_by: string;
}

export interface AppEnvironment {
  name: string;
  appId: string;
  activeVersionId?: string;
  updatedAt: Date;
}

export interface AppEnvironmentRow {
  name: string;
  app_id: string;
  active_version_id?: string;
  updated_at: Date;
}
