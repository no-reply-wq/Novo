/**
 * App version lifecycle: Draft → Preview → Published → Archived
 * and environment management.
 */

import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { AppVersion, AppEnvironment, EnvironmentType, AppVersionRow, AppEnvironmentRow } from './types';
import { exportApp } from './exporter';

function rowToVersion(r: AppVersionRow): AppVersion {
  return {
    id: r.id,
    appId: r.app_id,
    version: r.version,
    status: r.status as AppVersion['status'],
    bundle: r.bundle,
    publishedAt: r.published_at ?? undefined,
    publishedBy: r.published_by ?? undefined,
    rollbackFrom: r.rollback_from ?? undefined,
    createdAt: r.created_at,
  };
}

export async function createVersion(
  appId: string,
  tenantSlug: string,
  versionLabel: string,
  client: PoolClient,
  createdBy?: string,
): Promise<AppVersion> {
  const bundle = await exportApp(appId, tenantSlug, client, createdBy);
  const id = uuidv4();
  const res = await client.query<AppVersionRow>(
    `INSERT INTO platform.app_versions (id, app_id, version, status, bundle, created_at)
     VALUES ($1, $2, $3, 'draft', $4, NOW())
     RETURNING *`,
    [id, appId, versionLabel, JSON.stringify(bundle)],
  );
  return rowToVersion(res.rows[0]);
}

export async function listVersions(appId: string, client: PoolClient): Promise<AppVersion[]> {
  const res = await client.query<AppVersionRow>(
    `SELECT * FROM platform.app_versions WHERE app_id = $1 ORDER BY created_at DESC`,
    [appId],
  );
  return res.rows.map(rowToVersion);
}

export async function getVersion(versionId: string, appId: string, client: PoolClient): Promise<AppVersion> {
  const res = await client.query<AppVersionRow>(
    `SELECT * FROM platform.app_versions WHERE id = $1 AND app_id = $2`,
    [versionId, appId],
  );
  if (res.rowCount === 0) throw new Error(`Version not found: ${versionId}`);
  return rowToVersion(res.rows[0]);
}

export async function promoteToPreview(versionId: string, appId: string, client: PoolClient): Promise<AppVersion> {
  const version = await getVersion(versionId, appId, client);
  if (version.status !== 'draft') throw new Error(`Can only promote draft versions to preview; current status: ${version.status}`);
  const res = await client.query<AppVersionRow>(
    `UPDATE platform.app_versions SET status = 'preview' WHERE id = $1 RETURNING *`,
    [versionId],
  );
  return rowToVersion(res.rows[0]);
}

export async function publishVersion(
  versionId: string,
  appId: string,
  client: PoolClient,
  publishedBy?: string,
): Promise<AppVersion> {
  const version = await getVersion(versionId, appId, client);
  if (version.status === 'published') return version; // idempotent
  if (version.status === 'archived') throw new Error('Cannot publish an archived version');

  // Archive existing published version
  await client.query(
    `UPDATE platform.app_versions SET status = 'archived'
     WHERE app_id = $1 AND status = 'published' AND id != $2`,
    [appId, versionId],
  );

  const res = await client.query<AppVersionRow>(
    `UPDATE platform.app_versions
     SET status = 'published', published_at = NOW(), published_by = $1
     WHERE id = $2 RETURNING *`,
    [publishedBy ?? null, versionId],
  );
  const updated = rowToVersion(res.rows[0]);
  await updateEnvironmentVersion(appId, 'production', versionId, client);
  return updated;
}

export async function rollbackVersion(
  appId: string,
  targetVersionId: string,
  client: PoolClient,
  rolledBackBy?: string,
): Promise<AppVersion> {
  const target = await getVersion(targetVersionId, appId, client);

  // Archive current published
  await client.query(
    `UPDATE platform.app_versions SET status = 'archived'
     WHERE app_id = $1 AND status = 'published'`,
    [appId],
  );

  const newId = uuidv4();
  const res = await client.query<AppVersionRow>(
    `INSERT INTO platform.app_versions (id, app_id, version, status, bundle, published_at, published_by, rollback_from, created_at)
     VALUES ($1, $2, $3, 'published', $4, NOW(), $5, $6, NOW())
     RETURNING *`,
    [newId, appId, target.version + '-rollback', JSON.stringify(target.bundle), rolledBackBy ?? null, targetVersionId],
  );
  const newVersion = rowToVersion(res.rows[0]);
  await updateEnvironmentVersion(appId, 'production', newId, client);
  return newVersion;
}

export async function ensureEnvironments(appId: string, appSlug: string, client: PoolClient): Promise<void> {
  const envs: Array<{ type: EnvironmentType; slug: string }> = [
    { type: 'development', slug: `${appSlug}-dev` },
    { type: 'staging', slug: `${appSlug}-staging` },
    { type: 'production', slug: appSlug },
  ];
  for (const env of envs) {
    await client.query(
      `INSERT INTO platform.app_environments (id, app_id, type, slug)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (app_id, type) DO NOTHING`,
      [uuidv4(), appId, env.type, env.slug],
    );
  }
}

export async function listEnvironments(appId: string, client: PoolClient): Promise<AppEnvironment[]> {
  const res = await client.query<AppEnvironmentRow>(
    `SELECT * FROM platform.app_environments WHERE app_id = $1`,
    [appId],
  );
  return res.rows.map(r => ({
    id: r.id,
    appId: r.app_id,
    type: r.type as EnvironmentType,
    currentVersionId: r.current_version_id ?? undefined,
    slug: r.slug,
  }));
}

export async function updateEnvironmentVersion(
  appId: string,
  type: EnvironmentType,
  versionId: string,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE platform.app_environments SET current_version_id = $1
     WHERE app_id = $2 AND type = $3`,
    [versionId, appId, type],
  );
}

export async function getEnvironmentBundle(appId: string, type: EnvironmentType, client: PoolClient) {
  const res = await client.query(
    `SELECT av.bundle FROM platform.app_environments ae
     JOIN platform.app_versions av ON av.id = ae.current_version_id
     WHERE ae.app_id = $1 AND ae.type = $2`,
    [appId, type],
  );
  if (res.rowCount === 0) return null;
  return res.rows[0].bundle as unknown;
}
