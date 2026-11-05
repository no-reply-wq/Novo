/**
 * App version management — create snapshots, list history, and roll back.
 */

import { PoolClient } from 'pg';
import { exportApp } from './exporter.js';
import { importApp } from './importer.js';
import type { AppPackage, AppVersionRow } from './types.js';

export interface AppVersion {
  id: string;
  tenantSlug: string;
  appId: string;
  label: string;
  createdBy: string | null;
  createdAt: Date;
}

/**
 * Creates a named snapshot of the current app state.
 * Returns the versionId.
 */
export async function createAppVersion(
  tenantSlug: string,
  appId: string,
  label: string,
  db: PoolClient,
  createdBy?: string,
): Promise<string> {
  const snapshot = await exportApp(tenantSlug, appId, db);

  const res = await db.query<{ id: string }>(
    `INSERT INTO platform.app_versions (tenant_slug, app_id, label, snapshot, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [tenantSlug, appId, label, JSON.stringify(snapshot), createdBy ?? null],
  );

  return res.rows[0].id;
}

/**
 * Returns all versions for an app, most recent first.
 */
export async function listAppVersions(
  tenantSlug: string,
  appId: string,
  db: PoolClient,
): Promise<AppVersion[]> {
  const res = await db.query<AppVersionRow>(
    `SELECT id, tenant_slug, app_id, label, created_by, created_at
     FROM platform.app_versions
     WHERE tenant_slug = $1 AND app_id = $2
     ORDER BY created_at DESC`,
    [tenantSlug, appId],
  );

  return res.rows.map((row: AppVersionRow) => ({
    id: row.id,
    tenantSlug: row.tenant_slug,
    appId: row.app_id,
    label: row.label,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

/**
 * Retrieves the full snapshot for a specific version.
 */
export async function getAppVersionSnapshot(
  versionId: string,
  tenantSlug: string,
  db: PoolClient,
): Promise<AppPackage> {
  const res = await db.query<Pick<AppVersionRow, 'snapshot' | 'tenant_slug'>>(
    `SELECT snapshot, tenant_slug
     FROM platform.app_versions
     WHERE id = $1 AND tenant_slug = $2`,
    [versionId, tenantSlug],
  );

  if (res.rowCount === 0) {
    throw new Error(`Version ${versionId} not found for tenant ${tenantSlug}`);
  }

  return res.rows[0].snapshot;
}

/**
 * Rolls back an app to a previously saved version snapshot.
 * This overwrites the current app config with the snapshot contents.
 * Returns the new app ID (same as before since we overwrite).
 */
export async function rollbackToVersion(
  tenantSlug: string,
  appId: string,
  versionId: string,
  db: PoolClient,
  restoredBy?: string,
): Promise<{ appId: string; warnings: string[] }> {
  const snapshot = await getAppVersionSnapshot(versionId, tenantSlug, db);

  // Verify the snapshot is for the correct app
  if (snapshot.app.id !== appId) {
    throw new Error(
      `Version ${versionId} belongs to app ${snapshot.app.id}, not ${appId}`,
    );
  }

  // Before rollback, save a "pre-rollback" version for safety
  await createAppVersion(
    tenantSlug,
    appId,
    `pre-rollback-${new Date().toISOString()}`,
    db,
    restoredBy,
  );

  // Import the snapshot with overwrite
  const result = await importApp(
    tenantSlug,
    snapshot,
    { overwrite: true },
    db,
  );

  return result;
}
