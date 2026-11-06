/**
 * Draft → Preview → Publish lifecycle and rollback for app versions.
 * Also manages per-environment version pointers (dev / staging / production).
 */

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { exportApp } from './exporter.js';
import type {
  AppBundle,
  AppVersion,
  AppPublishStatus,
  AppEnvironment,
  EnvironmentType,
  AppVersionRow,
  AppEnvironmentRow,
} from './types.js';

function uuid(): string {
  return randomUUID();
}

function dbClient(dbOrPool: PoolClient | Pool): { client: PoolClient; owned: boolean } {
  if ('release' in dbOrPool) {
    return { client: dbOrPool as PoolClient, owned: false };
  }
  // Will be resolved asynchronously by the caller
  throw new Error('Pass a PoolClient, not a Pool, to versioning functions');
}

// ─── Version CRUD ─────────────────────────────────────────────────────────────

function rowToVersion(row: AppVersionRow): AppVersion {
  return {
    id: row.id,
    appId: row.app_id,
    version: row.version,
    status: row.status as AppPublishStatus | 'archived',
    bundle: row.bundle,
    publishedAt: row.published_at ?? undefined,
    publishedBy: row.published_by ?? undefined,
    rollbackFrom: row.rollback_from ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Creates a new draft version by snapshotting the current app state.
 */
export async function createVersion(
  appId: string,
  tenantSlug: string,
  versionLabel: string,
  client: PoolClient,
  createdBy?: string,
): Promise<AppVersion> {
  const bundle = await exportApp(appId, tenantSlug, client, createdBy ?? 'system');

  // Override the bundle's version with the provided label (validate semver-ish)
  const version = versionLabel.trim() || bundle.version;

  const id = uuid();
  const res = await client.query<AppVersionRow>(
    `INSERT INTO platform.app_versions
       (id, app_id, version, status, bundle, published_by)
     VALUES ($1, $2, $3, 'draft', $4, $5)
     RETURNING *`,
    [id, appId, version, JSON.stringify(bundle), createdBy ?? null],
  );

  return rowToVersion(res.rows[0]);
}

/**
 * Returns all versions for an app, most recent first.
 */
export async function listVersions(
  appId: string,
  client: PoolClient,
): Promise<AppVersion[]> {
  const res = await client.query<AppVersionRow>(
    `SELECT * FROM platform.app_versions
     WHERE app_id = $1
     ORDER BY created_at DESC`,
    [appId],
  );
  return res.rows.map(rowToVersion);
}

/**
 * Returns one version by ID.
 */
export async function getVersion(
  versionId: string,
  appId: string,
  client: PoolClient,
): Promise<AppVersion> {
  const res = await client.query<AppVersionRow>(
    `SELECT * FROM platform.app_versions WHERE id = $1 AND app_id = $2`,
    [versionId, appId],
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new Error(`Version ${versionId} not found for app ${appId}`);
  }
  return rowToVersion(res.rows[0]);
}

/**
 * Promote a draft version to preview status.
 * Preview versions are accessible via a preview URL but not live.
 */
export async function promoteToPreview(
  versionId: string,
  appId: string,
  client: PoolClient,
): Promise<void> {
  const v = await getVersion(versionId, appId, client);
  if (v.status !== 'draft') {
    throw new Error(`Version ${versionId} is "${v.status}" — only drafts can be promoted to preview`);
  }
  await client.query(
    `UPDATE platform.app_versions
     SET status = 'preview'
     WHERE id = $1 AND app_id = $2`,
    [versionId, appId],
  );
}

/**
 * Publish a version: makes it live, archives the previous published version.
 * Requires the version to be in 'draft' or 'preview' status.
 */
export async function publishVersion(
  versionId: string,
  appId: string,
  client: PoolClient,
  publishedBy?: string,
): Promise<void> {
  const v = await getVersion(versionId, appId, client);
  if (v.status === 'published') {
    return; // already published — idempotent
  }
  if (v.status === 'archived') {
    throw new Error(`Version ${versionId} is archived and cannot be published`);
  }

  // Archive the currently published version
  await client.query(
    `UPDATE platform.app_versions
     SET status = 'archived'
     WHERE app_id = $1 AND status = 'published'`,
    [appId],
  );

  // Publish the target version
  await client.query(
    `UPDATE platform.app_versions
     SET status = 'published',
         published_at = now(),
         published_by = $3
     WHERE id = $1 AND app_id = $2`,
    [versionId, appId, publishedBy ?? null],
  );

  // Update the production environment pointer
  await updateEnvironmentVersion(appId, 'production', versionId, client);
}

/**
 * Rollback: create a new draft version from a previously published/archived
 * version's bundle, then immediately publish it.
 */
export async function rollbackVersion(
  appId: string,
  targetVersionId: string,
  client: PoolClient,
  rolledBackBy?: string,
): Promise<AppVersion> {
  const target = await getVersion(targetVersionId, appId, client);

  // Capture which version we're rolling back from
  const currentRes = await client.query<{ id: string }>(
    `SELECT id FROM platform.app_versions
     WHERE app_id = $1 AND status = 'published'
     ORDER BY published_at DESC LIMIT 1`,
    [appId],
  );
  const rollbackFromId = currentRes.rows[0]?.id ?? null;

  // Create a new version from the target bundle
  const newId = uuid();
  const res = await client.query<AppVersionRow>(
    `INSERT INTO platform.app_versions
       (id, app_id, version, status, bundle, published_by, rollback_from, published_at)
     VALUES ($1, $2, $3, 'published', $4, $5, $6, now())
     RETURNING *`,
    [
      newId,
      appId,
      `${target.version}-rollback-${Date.now()}`,
      JSON.stringify(target.bundle),
      rolledBackBy ?? null,
      rollbackFromId,
    ],
  );

  // Archive the previously published version
  await client.query(
    `UPDATE platform.app_versions
     SET status = 'archived'
     WHERE app_id = $1 AND status = 'published' AND id != $2`,
    [appId, newId],
  );

  // Update production environment
  await updateEnvironmentVersion(appId, 'production', newId, client);

  return rowToVersion(res.rows[0]);
}

// ─── Environments ─────────────────────────────────────────────────────────────

function rowToEnvironment(row: AppEnvironmentRow): AppEnvironment {
  return {
    id: row.id,
    appId: row.app_id,
    type: row.type as EnvironmentType,
    currentVersionId: row.current_version_id ?? undefined,
    slug: row.slug,
    createdAt: row.created_at,
  };
}

/**
 * Ensures the three default environments exist for an app.
 */
export async function ensureEnvironments(
  appId: string,
  appSlug: string,
  client: PoolClient,
): Promise<AppEnvironment[]> {
  const envTypes: Array<{ type: EnvironmentType; suffix: string }> = [
    { type: 'development', suffix: '-dev' },
    { type: 'staging', suffix: '-staging' },
    { type: 'production', suffix: '' },
  ];

  for (const { type, suffix } of envTypes) {
    await client.query(
      `INSERT INTO platform.app_environments (id, app_id, type, slug)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (app_id, type) DO NOTHING`,
      [uuid(), appId, type, `${appSlug}${suffix}`],
    );
  }

  return listEnvironments(appId, client);
}

/**
 * Lists all environments for an app.
 */
export async function listEnvironments(
  appId: string,
  client: PoolClient,
): Promise<AppEnvironment[]> {
  const res = await client.query<AppEnvironmentRow>(
    `SELECT * FROM platform.app_environments WHERE app_id = $1 ORDER BY created_at`,
    [appId],
  );
  return res.rows.map(rowToEnvironment);
}

/**
 * Updates which version an environment points to.
 */
export async function updateEnvironmentVersion(
  appId: string,
  type: EnvironmentType,
  versionId: string,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE platform.app_environments
     SET current_version_id = $3
     WHERE app_id = $1 AND type = $2`,
    [appId, type, versionId],
  );
}

/**
 * Returns the current bundle for a given environment (or null if none set).
 */
export async function getEnvironmentBundle(
  appId: string,
  type: EnvironmentType,
  client: PoolClient,
): Promise<AppBundle | null> {
  const res = await client.query<{ bundle: AppBundle }>(
    `SELECT av.bundle
     FROM platform.app_environments ae
     JOIN platform.app_versions av ON ae.current_version_id = av.id
     WHERE ae.app_id = $1 AND ae.type = $2`,
    [appId, type],
  );
  return res.rows[0]?.bundle ?? null;
}
