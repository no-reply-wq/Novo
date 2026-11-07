/**
 * Clone service — copies an app to a different tenant in-process.
 */

import { Pool, PoolClient } from 'pg';
import { assembleBundle } from './bundle-assembler';
import type { AppBundle as PkgBundle } from '../packaging/types';
import type { ImportOptions as PkgImportOptions } from '../packaging/types';

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

export interface CloneResult {
  newAppId: string;
}

export async function cloneAppToTenant(
  sourceAppId: string,
  targetTenantSlug: string,
  newAppName: string,
  userId: string,
  pgPool: Pool | PoolClient,
  withData = false,
): Promise<CloneResult> {
  return withClient(pgPool, async (client) => {
    const bundle = await assembleBundle(sourceAppId, client, undefined, userId);

    const { importApp: pkgImportApp } = await import('../packaging/importer');

    const pkgBundle: PkgBundle = {
      version: '1.0',
      exportedAt: bundle.exportedAt,
      exportedBy: userId,
      app: {
        name: newAppName,
        slug: newAppName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        icon: bundle.app.icon,
        description: bundle.app.description,
      },
      schema: bundle.schema as PkgBundle['schema'],
      ui: bundle.ui as PkgBundle['ui'],
      logic: bundle.logic as PkgBundle['logic'],
      scripts: bundle.scripts as unknown as PkgBundle['scripts'],
      integrations: bundle.integrations as PkgBundle['integrations'],
    };

    const pkgOptions: PkgImportOptions = {
      targetTenantSlug,
      newAppName,
      mergeMode: 'replace',
    };

    const result = await pkgImportApp(pkgBundle, pkgOptions, client);
    const newAppId = result.appId;

    if (withData) {
      await copyTableData(sourceAppId, newAppId, targetTenantSlug, client);
    }

    return { newAppId };
  });
}

async function copyTableData(
  sourceAppId: string,
  targetAppId: string,
  targetTenantSlug: string,
  client: PoolClient,
): Promise<void> {
  const srcTenantRes = await client.query<{ tenant_slug: string }>(
    'SELECT tenant_slug FROM public.apps WHERE id = $1',
    [sourceAppId],
  );
  if ((srcTenantRes.rowCount ?? 0) === 0) return;
  const sourceTenantSlug = srcTenantRes.rows[0].tenant_slug;

  const srcTablesRes = await client.query<{ id: string; slug: string }>(
    'SELECT id, slug FROM platform.tables WHERE app_id = $1',
    [sourceAppId],
  );
  const tgtTablesRes = await client.query<{ id: string; slug: string }>(
    'SELECT id, slug FROM platform.tables WHERE app_id = $1',
    [targetAppId],
  );

  const tgtBySlug = new Map(tgtTablesRes.rows.map((r) => [r.slug, r.id]));

  for (const srcTable of srcTablesRes.rows) {
    if (!tgtBySlug.has(srcTable.slug)) continue;
    const srcSchema = 'tenant_' + sourceTenantSlug.replace(/-/g, '_');
    const tgtSchema = 'tenant_' + targetTenantSlug.replace(/-/g, '_');
    await client.query(
      'INSERT INTO "' + tgtSchema + '"."' + srcTable.slug + '" ' +
      'SELECT * FROM "' + srcSchema + '"."' + srcTable.slug + '" ' +
      "WHERE COALESCE((data->>'is_deleted')::boolean, false) = false " +
      'ON CONFLICT DO NOTHING',
    );
  }
}
