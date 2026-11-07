/**
 * Version service — create, list, get, publish, and rollback app versions.
 */

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { assembleBundle } from './bundle-assembler';
import type { AppVersion, AppVersionRow, AppEnvironment, AppEnvironmentRow } from './types';

function uuid(): string {
  return randomUUID();
}

function rowToVersion(row: AppVersionRow): AppVersion {
  return {
    id: row.id,
    appId: row.app_id,
    versionNumber: row.version_number,
    label: row.label ?? undefined,
    status: row.status as AppVersion['status'],
    bundle: row.bundle,
    createdAt: row.created_at,
    createdBy: row.created_by ?? 'system',
    publishedAt: row.published_at ?? undefined,
    rollbackFrom: row.rollback_from ?? undefined,
  };
}

function rowToEnvironment(row: AppEnvironmentRow): AppEnvironment {
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name as AppEnvironment['name'],
    currentVersionId: row.current_version_id ?? undefined,
    settings: row.settings ?? {},
  };
}

async function withClient<T>(
  pgPool: Pool | PoolClient,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if ('connect' in pgPool && typeof (pgPool as Pool).connect === 'function') {
    const client = await (pgPool as Pool).connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(pgPool as PoolClient);
}

export async function createVersion(
  appId: string,
  label: string | undefined,
  createdBy: string,
  pgPool: Pool | PoolClient,
): Promise<AppVersion> {
  return withClient(pgPool, async (client) => {
    const bundle = await assembleBundle(appId, client);

    const numRes = await client.query<{ next_num: number }>(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_num FROM platform.app_versions WHERE app_id = $1',
      [appId],
    );
    const versionNumber = numRes.rows[0].next_num;

    const id = uuid();
    const res = await client.query<AppVersionRow>(
      'INSERT INTO platform.app_versions (id, app_id, version_number, label, status, bundle, created_by) VALUES ($1, $2, $3, $4, \'draft\', $5, $6) RETURNING *',
      [id, appId, versionNumber, label ?? null, JSON.stringify(bundle), createdBy],
    );

    return rowToVersion(res.rows[0]);
  });
}

export async function listVersions(
  appId: string,
  pgPool: Pool | PoolClient,
): Promise<AppVersion[]> {
  return withClient(pgPool, async (client) => {
    const res = await client.query<AppVersionRow>(
      'SELECT * FROM platform.app_versions WHERE app_id = $1 ORDER BY version_number DESC',
      [appId],
    );
    return res.rows.map(rowToVersion);
  });
}

export async function getVersion(
  versionId: string,
  pgPool: Pool | PoolClient,
): Promise<AppVersion> {
  return withClient(pgPool, async (client) => {
    const res = await client.query<AppVersionRow>(
      'SELECT * FROM platform.app_versions WHERE id = $1',
      [versionId],
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new Error('Version ' + versionId + ' not found');
    }
    return rowToVersion(res.rows[0]);
  });
}

export async function publishVersion(
  versionId: string,
  environment: 'staging' | 'production',
  userId: string,
  pgPool: Pool | PoolClient,
): Promise<void> {
  return withClient(pgPool, async (client) => {
    const v = await getVersion(versionId, client);

    if (v.status === 'archived') {
      throw new Error('Version ' + versionId + ' is archived and cannot be published');
    }

    const envRes = await client.query<{ current_version_id: string | null }>(
      'SELECT current_version_id FROM platform.app_environments WHERE app_id = $1 AND (name = $2 OR type = $2)',
      [v.appId, environment],
    );
    const prevVersionId = envRes.rows[0]?.current_version_id;
    if (prevVersionId && prevVersionId !== versionId) {
      await client.query(
        'UPDATE platform.app_versions SET status = \'archived\' WHERE id = $1 AND status = \'published\'',
        [prevVersionId],
      );
    }

    await client.query(
      'UPDATE platform.app_versions SET status = \'published\', published_at = now(), published_by = $2 WHERE id = $1',
      [versionId, userId],
    );

    await client.query(
      'UPDATE platform.app_environments SET current_version_id = $3 WHERE app_id = $1 AND (name = $2 OR type = $2)',
      [v.appId, environment, versionId],
    );
  });
}

export async function rollbackVersion(
  appId: string,
  targetVersionId: string,
  environment: 'staging' | 'production',
  userId: string,
  pgPool: Pool | PoolClient,
): Promise<void> {
  return withClient(pgPool, async (client) => {
    const res = await client.query<{ id: string }>(
      'SELECT id FROM platform.app_versions WHERE id = $1 AND app_id = $2',
      [targetVersionId, appId],
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new Error('Version ' + targetVersionId + ' not found for app ' + appId);
    }

    await client.query(
      'UPDATE platform.app_environments SET current_version_id = $3 WHERE app_id = $1 AND (name = $2 OR type = $2)',
      [appId, environment, targetVersionId],
    );

    await client.query(
      'UPDATE platform.app_versions SET published_by = $2 WHERE id = $1',
      [targetVersionId, userId],
    );
  });
}

export async function listEnvironments(
  appId: string,
  pgPool: Pool | PoolClient,
): Promise<AppEnvironment[]> {
  return withClient(pgPool, async (client) => {
    const res = await client.query<AppEnvironmentRow>(
      'SELECT id, app_id, COALESCE(name, type) AS name, current_version_id, COALESCE(settings, \'{}\'::jsonb) AS settings FROM platform.app_environments WHERE app_id = $1 ORDER BY created_at',
      [appId],
    );
    return res.rows.map(rowToEnvironment);
  });
}

export async function updateEnvironmentSettings(
  appId: string,
  envName: 'development' | 'staging' | 'production',
  settings: Record<string, unknown>,
  pgPool: Pool | PoolClient,
): Promise<AppEnvironment> {
  return withClient(pgPool, async (client) => {
    const res = await client.query<AppEnvironmentRow>(
      'UPDATE platform.app_environments SET settings = $3::jsonb WHERE app_id = $1 AND (name = $2 OR type = $2) RETURNING id, app_id, COALESCE(name, type) AS name, current_version_id, COALESCE(settings, \'{}\'::jsonb) AS settings',
      [appId, envName, JSON.stringify(settings)],
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new Error('Environment ' + envName + ' not found for app ' + appId);
    }
    return rowToEnvironment(res.rows[0]);
  });
}
